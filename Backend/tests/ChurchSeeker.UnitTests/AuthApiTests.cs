using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using ChurchSeeker.Infrastructure.Identity;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ChurchSeeker.UnitTests;

public class AuthApiFactory : WebApplicationFactory<Program>
{
    public const string AdminEmail = "admin@test.local";
    public const string AdminPassword = "Adm1n!Passw0rd#";
    protected virtual int AuthLimit => 10000;
    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), $"cs-store-{Guid.NewGuid():N}");
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"cs-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Jwt:Key", "test-key-test-key-test-key-test-key-1234");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbFile}");
        builder.UseSetting("Database:AutoCreate", "true");
        builder.UseSetting("Storage:Root", StorageRoot);
        builder.UseSetting("RateLimiting:Auth", AuthLimit.ToString());
        builder.UseSetting("Cors:AllowedOrigins:0", "http://localhost:5173");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Seed:AdminChurchId", ChurchSeedData.SantaLuciaId.ToString());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* best effort */ }
        try { if (Directory.Exists(StorageRoot)) Directory.Delete(StorageRoot, true); } catch { /* best effort */ }
    }
}

public class AuthApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AuthApiTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient Client() => _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private static string? RefreshCookie(HttpResponseMessage r) =>
        r.Headers.TryGetValues("Set-Cookie", out var v)
            ? v.FirstOrDefault(c => c.StartsWith("cs_refresh="))
            : null;

    private static string CookieValue(string setCookie) => setCookie.Split(';')[0]["cs_refresh=".Length..];

    private static async Task<string> TokenOf(HttpResponseMessage r)
    {
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("accessToken").GetString()!;
    }

    private async Task<HttpResponseMessage> Login(HttpClient c, string email, string password) =>
        await c.PostAsJsonAsync("/api/auth/login", new { email, password });

    private async Task<string> AdminToken(HttpClient c) =>
        await TokenOf(await Login(c, AuthApiFactory.AdminEmail, AuthApiFactory.AdminPassword));

    [Fact]
    public async Task Login_Success_SetsHardenedRefreshCookie()
    {
        var res = await Login(Client(), AuthApiFactory.AdminEmail, AuthApiFactory.AdminPassword);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var cookie = RefreshCookie(res)!;
        cookie.Should().NotBeNull();
        cookie.ToLowerInvariant().Should().Contain("httponly").And.Contain("secure").And.Contain("samesite=strict");
        (await res.Content.ReadAsStringAsync()).Should().NotContain(CookieValue(cookie));
    }

    [Theory]
    [InlineData("admin@test.local", "wrong-Password1!")]
    [InlineData("nobody@test.local", "Whatever1!Whatever")]
    [InlineData("", "")]
    [InlineData("' OR 1=1 --", "' OR 1=1 --")]
    public async Task Login_BadCredentials_Generic401(string email, string password)
    {
        var res = await Login(Client(), email, password);
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_Locks_After5Failures_EvenWithCorrectPassword()
    {
        var c = Client();
        var admin = await AdminToken(c);
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", admin);
        var reg = await c.PostAsJsonAsync("/api/auth/users",
            new { email = "lock@test.local", fullName = "Lock Me", password = "L0ck!Passw0rd#", role = 3 });
        reg.StatusCode.Should().Be(HttpStatusCode.Created);

        var anon = Client();
        for (var i = 0; i < 5; i++)
            (await Login(anon, "lock@test.local", "bad-Password1!")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Login(anon, "lock@test.local", "L0ck!Passw0rd#")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Refresh_Rotates_AndReuseKillsEverySession()
    {
        var c = Client();
        var first = RefreshCookie(await Login(c, AuthApiFactory.AdminEmail, AuthApiFactory.AdminPassword))!;

        HttpRequestMessage Req(string cookie) =>
            new(HttpMethod.Post, "/api/auth/refresh") { Headers = { { "Cookie", $"cs_refresh={CookieValue(cookie)}" } } };

        var second = await c.SendAsync(Req(first));
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        var rotated = RefreshCookie(second)!;
        CookieValue(rotated).Should().NotBe(CookieValue(first));

        (await c.SendAsync(Req(first))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await c.SendAsync(Req(rotated))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Refresh_WithoutOrGarbageCookie_401()
    {
        var c = Client();
        (await c.PostAsync("/api/auth/refresh", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh") { Headers = { { "Cookie", "cs_refresh=garbage" } } };
        (await c.SendAsync(req)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_RequiresValidToken_AndReturnsChurchOfCaller()
    {
        var c = Client();
        (await c.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var token = await AdminToken(c);
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var me = await c.GetStringAsync("/api/auth/me");
        me.Should().Contain(ChurchSeedData.SantaLuciaId.ToString()).And.Contain("Administrador");
    }

    [Fact]
    public async Task TamperedJwt_401()
    {
        var c = Client();
        var token = await AdminToken(c);
        var parts = token.Split('.');
        // Swap in a payload claiming another church; signature no longer matches.
        var payload = System.Text.Encoding.UTF8.GetString(Microsoft.IdentityModel.Tokens.Base64UrlEncoder.DecodeBytes(parts[1]));
        var forged = payload.Replace(ChurchSeedData.SantaLuciaId.ToString(), ChurchSeedData.JesusId.ToString());
        var forgedToken = $"{parts[0]}.{Microsoft.IdentityModel.Tokens.Base64UrlEncoder.Encode(forged)}.{parts[2]}";
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", forgedToken);
        (await c.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task AlgNoneJwt_401()
    {
        var c = Client();
        string B64(string s) => Microsoft.IdentityModel.Tokens.Base64UrlEncoder.Encode(s);
        var token = $"{B64("{\"alg\":\"none\",\"typ\":\"JWT\"}")}.{B64($"{{\"sub\":\"{Guid.NewGuid()}\",\"role\":\"Administrador\",\"church_id\":\"{ChurchSeedData.JesusId}\",\"iss\":\"churchseeker\",\"aud\":\"churchseeker-clients\",\"exp\":9999999999}}")}.";
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        (await c.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Register_NonAdmin_403_AndPayloadChurchIgnored()
    {
        var c = Client();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await AdminToken(c));
        var reg = await c.PostAsJsonAsync("/api/auth/users",
            new { email = "sec@test.local", fullName = "Secretaria", password = "S3c!Passw0rd#x", role = 3, churchId = ChurchSeedData.JesusId });
        reg.StatusCode.Should().Be(HttpStatusCode.Created);
        (await reg.Content.ReadAsStringAsync()).Should().Contain(ChurchSeedData.SantaLuciaId.ToString());

        var secToken = await TokenOf(await Login(Client(), "sec@test.local", "S3c!Passw0rd#x"));
        var c2 = Client();
        c2.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", secToken);
        var denied = await c2.PostAsJsonAsync("/api/auth/users",
            new { email = "x@test.local", fullName = "X", password = "X!Passw0rd#xx", role = 1 });
        denied.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Register_WeakPassword_400()
    {
        var c = Client();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await AdminToken(c));
        var res = await c.PostAsJsonAsync("/api/auth/users",
            new { email = "weak@test.local", fullName = "Weak", password = "123", role = 5 });
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ForgotPassword_SameAnswerForKnownAndUnknownEmail()
    {
        var c = Client();
        var known = await c.PostAsJsonAsync("/api/auth/forgot-password", new { email = AuthApiFactory.AdminEmail });
        var unknown = await c.PostAsJsonAsync("/api/auth/forgot-password", new { email = "ghost@test.local" });
        known.StatusCode.Should().Be(HttpStatusCode.NoContent);
        unknown.StatusCode.Should().Be(known.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_BadToken_401()
    {
        var res = await Client().PostAsJsonAsync("/api/auth/reset-password",
            new { email = AuthApiFactory.AdminEmail, token = "not-a-real-token", newPassword = "N3w!Passw0rd#x" });
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ResetPassword_ValidToken_WorksOnce_AndRevokesSessions()
    {
        var c = Client();
        var rt = RefreshCookie(await Login(c, AuthApiFactory.AdminEmail, AuthApiFactory.AdminPassword))!;

        string token;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            token = await users.GeneratePasswordResetTokenAsync((await users.FindByEmailAsync(AuthApiFactory.AdminEmail))!);
        }

        var body = new { email = AuthApiFactory.AdminEmail, token, newPassword = "Adm1n!Passw0rd#" };
        (await c.PostAsJsonAsync("/api/auth/reset-password", body)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        // Second use of the same token must fail.
        (await c.PostAsJsonAsync("/api/auth/reset-password", body)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh") { Headers = { { "Cookie", $"cs_refresh={CookieValue(rt)}" } } };
        (await c.SendAsync(req)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}


