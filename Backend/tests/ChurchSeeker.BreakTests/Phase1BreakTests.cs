using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.BreakTests;

public class LowLimitBreakFactory : BreakFactory
{
    protected override int AuthLimit => 10;
}

// Every test here tries to break the system. A failing test means a real defect.
public class Phase1BreakTests : IClassFixture<BreakFactory>, IClassFixture<LowLimitBreakFactory>
{
    private readonly BreakFactory _f;
    private readonly LowLimitBreakFactory _low;

    public Phase1BreakTests(BreakFactory f, LowLimitBreakFactory low)
    {
        _f = f;
        _low = low;
    }

    private async Task CreateUser(string email, string password, int role)
    {
        var res = await _f.WithBearer(await _f.AdminToken()).PostAsJsonAsync("/api/auth/users",
            new { email, fullName = "Break User", password, role });
        res.StatusCode.Should().Be(HttpStatusCode.Created, await res.Content.ReadAsStringAsync());
    }

    // ---- Brute force -------------------------------------------------------------------

    [Fact]
    public async Task ConcurrentGuessing_NeverSucceeds_AndNeverCrashes()
    {
        await CreateUser("victim@break.local", "V1ctim!Passw0rd#", 3);
        var attempts = Enumerable.Range(0, 30).Select(i =>
            BreakFactory.Login(_f.Anonymous(), "victim@break.local", $"Guess{i}!Wrong#pw")).ToArray();
        var results = await Task.WhenAll(attempts);

        var broken = results.FirstOrDefault(r => r.StatusCode != HttpStatusCode.Unauthorized);
        var detail = broken is null ? "" : (await broken.Content.ReadAsStringAsync())[..Math.Min(600, (await broken.Content.ReadAsStringAsync()).Length)];
        results.Should().OnlyContain(r => r.StatusCode == HttpStatusCode.Unauthorized, "no 5xx and no success under load: " + detail);
        (await BreakFactory.Login(_f.Anonymous(), "victim@break.local", "V1ctim!Passw0rd#"))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized, "account must be locked after the burst");
    }

    [Fact]
    public async Task PasswordSpraying_ManyAccountsOneIp_HitsRateLimit()
    {
        var c = _low.Anonymous();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 25; i++)
            codes.Add((await BreakFactory.Login(c, $"user{i}@break.local", "Spring2026!x")).StatusCode);
        codes.Should().Contain(HttpStatusCode.TooManyRequests);
        codes.Count(s => s == HttpStatusCode.Unauthorized).Should().BeLessThanOrEqualTo(10);
    }

    [Fact]
    public async Task ForgotPassword_Flooding_IsRateLimited_AndNeverEnumerates()
    {
        var c = _low.Anonymous();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 25; i++)
            codes.Add((await c.PostAsJsonAsync("/api/auth/forgot-password", new { email = $"u{i}@break.local" })).StatusCode);
        codes.Should().OnlyContain(s => s == HttpStatusCode.NoContent || s == HttpStatusCode.TooManyRequests);
        codes.Should().Contain(HttpStatusCode.TooManyRequests);
    }

    // ---- JWT manipulation --------------------------------------------------------------

    public static IEnumerable<object[]> BadTokens()
    {
        yield return ["wrong key", BreakFactory.Mint(key: "attacker-key-attacker-key-attacker-key-00")];
        yield return ["expired", BreakFactory.Mint(notBefore: DateTime.UtcNow.AddHours(-2), expires: DateTime.UtcNow.AddSeconds(-5))];
        yield return ["not yet valid", BreakFactory.Mint(notBefore: DateTime.UtcNow.AddHours(1), expires: DateTime.UtcNow.AddHours(2))];
        yield return ["wrong issuer", BreakFactory.Mint(issuer: "evil")];
        yield return ["wrong audience", BreakFactory.Mint(audience: "evil")];
        yield return ["empty bearer", ""];
        yield return ["junk", "not.a.jwt"];
        yield return ["huge", new string('A', 20000)];
    }

    [Theory]
    [MemberData(nameof(BadTokens))]
    public async Task BadJwt_IsRejected(string why, string token)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me") { Headers = { { "Authorization", $"Bearer {token}" } } };
        var res = await _f.Anonymous().SendAsync(req);
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized, why);
    }

    [Fact]
    public async Task HeaderSwapToHS512OrNone_IsRejected()
    {
        var good = await _f.AdminToken();
        var parts = good.Split('.');
        string B64(string s) => Microsoft.IdentityModel.Tokens.Base64UrlEncoder.Encode(s);
        foreach (var alg in new[] { "none", "HS512", "RS256", "NONE" })
        {
            var forged = $"{B64($"{{\"alg\":\"{alg}\",\"typ\":\"JWT\"}}")}.{parts[1]}.{parts[2]}";
            (await _f.WithBearer(forged).GetAsync("/api/auth/me")).StatusCode
                .Should().Be(HttpStatusCode.Unauthorized, $"alg={alg}");
        }
    }

    [Fact]
    public async Task ValidSignatureButHostileClaims_NeverGrantAdmin()
    {
        var payload = new { email = "x@break.local", fullName = "X", password = "X!Passw0rd#xxx", role = 1 };
        // Lowercase role, empty church, unknown role, missing sub: all must be denied.
        var cases = new[]
        {
            BreakFactory.Mint(role: "administrador"),
            BreakFactory.Mint(role: "Administrador", churchId: Guid.Empty.ToString()),
            BreakFactory.Mint(role: "Administrador", churchId: "not-a-guid"),
            BreakFactory.Mint(role: "SuperAdmin"),
            BreakFactory.Mint(role: "Administrador,Pastor"),
        };
        foreach (var token in cases)
        {
            var res = await _f.WithBearer(token).PostAsJsonAsync("/api/auth/users", payload);
            res.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized);
        }
    }

    // ---- Role escalation ---------------------------------------------------------------

    [Fact]
    public async Task EveryNonAdminRole_CannotCreateUsers()
    {
        var roles = new (string Name, int Id)[] { ("Pastor", 2), ("Secretario", 3), ("Tesorero", 4), ("Coordinador", 5) };
        foreach (var (name, id) in roles)
        {
            var email = $"{name.ToLower()}@break.local";
            await CreateUser(email, "R0le!Passw0rd#1", id);
            var token = await BreakFactory.AccessToken(await BreakFactory.Login(_f.Anonymous(), email, "R0le!Passw0rd#1"));
            var res = await _f.WithBearer(token).PostAsJsonAsync("/api/auth/users",
                new { email = $"child-{name}@break.local", fullName = "Child", password = "Ch1ld!Passw0rd#", role = 1 });
            res.StatusCode.Should().Be(HttpStatusCode.Forbidden, name);
        }
    }

    [Fact]
    public async Task Anonymous_CannotCreateUsers()
    {
        var res = await _f.Anonymous().PostAsJsonAsync("/api/auth/users",
            new { email = "a@break.local", fullName = "A", password = "A!Passw0rd#xxx", role = 1 });
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("Administrador", true, true, true)]
    [InlineData("Pastor", false, false, true)]
    [InlineData("Secretario", false, false, true)]
    [InlineData("Tesorero", false, true, false)]
    [InlineData("Coordinador", false, false, false)]
    [InlineData("", false, false, false)]
    public async Task PolicyMatrix_MatchesPlan(string role, bool adminOnly, bool finance, bool management)
    {
        var authz = _f.Services.GetRequiredService<IAuthorizationService>();
        var claims = role.Length == 0 ? [] : new[] { new Claim("role", role) };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, role.Length == 0 ? null : "test", "sub", "role"));

        (await authz.AuthorizeAsync(user, "AdminOnly")).Succeeded.Should().Be(adminOnly);
        (await authz.AuthorizeAsync(user, "Finance")).Succeeded.Should().Be(finance);
        (await authz.AuthorizeAsync(user, "Management")).Succeeded.Should().Be(management);
    }

    // ---- Tenant isolation (IDOR) -------------------------------------------------------

    [Fact]
    public async Task NewUsers_AlwaysLandInCallersChurch_EvenIfPayloadSaysOtherwise()
    {
        var token = await _f.AdminToken();
        var body = $"{{\"email\":\"idor@break.local\",\"fullName\":\"Idor\",\"password\":\"Id0r!Passw0rd#\",\"role\":3,\"churchId\":\"{ChurchSeedData.JesusId}\",\"ChurchId\":\"{ChurchSeedData.JesusId}\"}}";
        var res = await _f.WithBearer(token).PostAsync("/api/auth/users", new StringContent(body, Encoding.UTF8, "application/json"));
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        using var scope = _f.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        (await users.FindByEmailAsync("idor@break.local"))!.ChurchId.Should().Be(ChurchSeedData.CathedralId);
    }

    [Fact]
    public async Task NoCodeDisablesTenantFilters()
    {
        // Regression guard: a bypass of the global filter would silently break isolation.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "src"))) dir = dir.Parent;
        dir.Should().NotBeNull();
        var offenders = Directory.EnumerateFiles(Path.Combine(dir!.FullName, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}"))
            .Where(p => File.ReadAllText(p).Contains("IgnoreQueryFilters"))
            .ToList();
        offenders.Should().BeEmpty("IgnoreQueryFilters bypasses tenant isolation");
        await Task.CompletedTask;
    }

    // ---- Sessions ----------------------------------------------------------------------

    [Fact]
    public async Task DeactivatedUser_CannotLoginOrRefresh()
    {
        await CreateUser("gone@break.local", "G0ne!Passw0rd#xx", 3);
        var login = await BreakFactory.Login(_f.Anonymous(), "gone@break.local", "G0ne!Passw0rd#xx");
        var cookie = BreakFactory.RefreshCookie(login)!;

        using (var scope = _f.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var u = (await users.FindByEmailAsync("gone@break.local"))!;
            u.IsActive = false;
            await users.UpdateAsync(u);
        }

        (await BreakFactory.Login(_f.Anonymous(), "gone@break.local", "G0ne!Passw0rd#xx")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized);
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh")
            { Headers = { { "Cookie", $"cs_refresh={BreakFactory.CookieValue(cookie)}" } } };
        (await _f.Anonymous().SendAsync(req)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Logout_KillsRefreshToken()
    {
        var c = _f.Anonymous();
        var cookie = BreakFactory.RefreshCookie(await BreakFactory.Login(c, BreakFactory.AdminEmail, BreakFactory.AdminPassword))!;
        HttpRequestMessage Req(string path) => new(HttpMethod.Post, path)
            { Headers = { { "Cookie", $"cs_refresh={BreakFactory.CookieValue(cookie)}" } } };

        (await c.SendAsync(Req("/api/auth/logout"))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await c.SendAsync(Req("/api/auth/refresh"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ---- Hostile input -----------------------------------------------------------------

    public static IEnumerable<object[]> HostileBodies()
    {
        yield return ["{}"];
        yield return ["null"];
        yield return ["[]"];
        yield return ["{\"email\":null,\"password\":null}"];
        yield return ["{\"email\":123,\"password\":true}"];
        yield return ["{not json"];
        yield return [$"{{\"email\":\"{new string('a', 100000)}\",\"password\":\"x\"}}"];
        yield return [$"{{\"email\":\"a@b.c\",\"password\":\"{new string('p', 2_000_000)}\"}}"];
        yield return ["{\"email\":\"'; DROP TABLE AspNetUsers; --\",\"password\":\"x\"}"];
        yield return ["{\"email\":\"<script>alert(1)</script>\",\"password\":\"\\u0000\\uD800\"}"];
    }

    [Theory]
    [MemberData(nameof(HostileBodies))]
    public async Task Login_HostileBodies_NeverCause5xx(string body)
    {
        var res = await _f.Anonymous().PostAsync("/api/auth/login", new StringContent(body, Encoding.UTF8, "application/json"));
        ((int)res.StatusCode).Should().BeLessThan(500);
        res.StatusCode.Should().NotBe(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("garbage")]
    [InlineData("' OR 1=1 --")]
    [InlineData("../../etc/passwd")]
    public async Task Refresh_HostileCookies_Are401(string value)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh") { Headers = { { "Cookie", $"cs_refresh={value}" } } };
        (await _f.Anonymous().SendAsync(req)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ErrorResponses_DoNotLeakInternals()
    {
        var res = await _f.Anonymous().PostAsync("/api/auth/login", new StringContent("{not json", Encoding.UTF8, "application/json"));
        var text = await res.Content.ReadAsStringAsync();
        text.Should().NotContainAny("StackTrace", "System.", "Microsoft.", "SqlException", "AppDbContext");
    }
}
