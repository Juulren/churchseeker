using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.BreakTests;

// Who may work in which church: the active church in the token, access rows, the platform account and the plain Usuario.
public class ChurchAccessBreakTests : IClassFixture<BreakFactory>
{
    private static readonly Guid A = ChurchSeedData.CathedralId;
    private static readonly Guid B = ChurchSeedData.SantaLuciaId;
    private static readonly Guid C = ChurchSeedData.JesusId;
    private const string Pw = BreakFactory.UserPassword;

    private readonly BreakFactory _f;

    public ChurchAccessBreakTests(BreakFactory f) => _f = f;

    private sealed record Session(HttpClient Client, string Cookie, JsonElement User, string Email, Guid Id);

    private async Task<(string Email, Guid Id)> CreateAsync(UserRole role, Guid home, string tag, params Guid[] extra)
    {
        var email = $"{role}-{tag}-{Guid.NewGuid():N}@acc.local".ToLower();
        using var scope = _f.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email, FullName = $"{role} {tag}", ChurchId = home };
        (await users.CreateAsync(user, Pw)).Succeeded.Should().BeTrue();
        await users.AddToRoleAsync(user, role.ToString());
        foreach (var c in new[] { home }.Concat(extra)) db.UserChurchAccess.Add(new UserChurchAccess(user.Id, c));
        await db.SaveChangesAsync();
        return (email, user.Id);
    }

    private async Task<Session> SignInAsync(string email, Guid id)
    {
        var login = await BreakFactory.Login(_f.Anonymous(), email, Pw);
        login.StatusCode.Should().Be(HttpStatusCode.OK);
        var cookie = BreakFactory.RefreshCookie(login)!;
        var json = await BreakFactory.ReadJson(login);
        return Wrap(json.GetProperty("accessToken").GetString()!, cookie, json.GetProperty("user"), email, id);
    }

    private Session Wrap(string token, string cookie, JsonElement user, string email, Guid id)
    {
        var client = _f.WithBearer(token);
        client.DefaultRequestHeaders.Add("Cookie", $"cs_refresh={BreakFactory.CookieValue(cookie)}");
        return new Session(client, cookie, user, email, id);
    }

    private async Task<Session> NewAsync(UserRole role, Guid home, string tag, params Guid[] extra)
    {
        var (email, id) = await CreateAsync(role, home, tag, extra);
        return await SignInAsync(email, id);
    }

    private async Task<(HttpResponseMessage Response, Session? Next)> SwitchAsync(Session s, Guid church)
    {
        var res = await s.Client.PostAsJsonAsync("/api/auth/church", new { churchId = church });
        if (res.StatusCode != HttpStatusCode.OK) return (res, null);
        var json = await BreakFactory.ReadJson(res);
        return (res, Wrap(json.GetProperty("accessToken").GetString()!, BreakFactory.RefreshCookie(res)!, json.GetProperty("user"), s.Email, s.Id));
    }

    private static Guid ActiveChurch(Session s) => s.User.GetProperty("churchId").GetGuid();

    // ---- The platform and church roles are not up for grabs -----------------------------------------------------------

    [Fact]
    public async Task ChurchAdministrator_CannotCreateOrPromoteTheSuperRole()
    {
        var admin = await NewAsync(UserRole.Administrador, A, "mk");
        // By name and by number, through creation and through the role change.
        foreach (var role in new object[] { 6, "SuperAdministrador" })
        {
            var create = await admin.Client.PostAsJsonAsync("/api/auth/users", new { email = $"x{Guid.NewGuid():N}@acc.local", fullName = "X", password = Pw, role });
            create.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.UnprocessableEntity);
        }
        var (email, id) = await CreateAsync(UserRole.Secretario, A, "victim");
        var promote = await admin.Client.PutAsJsonAsync($"/api/staff/{id}/role", new { role = 6 });
        promote.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        // The plain account IS something a church can give.
        var plain = await admin.Client.PostAsJsonAsync("/api/auth/users", new { email = $"u{Guid.NewGuid():N}@acc.local", fullName = "U", password = Pw, role = 7 });
        plain.StatusCode.Should().Be(HttpStatusCode.Created);
        _ = email;
    }

    // ---- Switching church ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Switching_ToAChurchOutsideTheAccessSet_IsForbidden()
    {
        var admin = await NewAsync(UserRole.Administrador, A, "sw");
        (await admin.Client.PostAsJsonAsync("/api/auth/church", new { churchId = B })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await admin.Client.PostAsJsonAsync("/api/auth/church", new { churchId = Guid.NewGuid() })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        // Still working in the home church.
        ((await admin.Client.GetAsync("/api/church")).StatusCode).Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Switching_NeedsTheRefreshCookie_NotJustTheAccessToken()
    {
        var admin = await NewAsync(UserRole.Administrador, A, "nc", B);
        var tokenOnly = _f.WithBearer(await TokenOf(admin));
        (await tokenOnly.PostAsJsonAsync("/api/auth/church", new { churchId = B })).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private static Task<string> TokenOf(Session s) =>
        Task.FromResult(s.Client.DefaultRequestHeaders.Authorization!.Parameter!);

    [Fact]
    public async Task Switching_WorksWithinTheAccessSet_AndTheTokenWorksInThatChurchOnly()
    {
        var admin = await NewAsync(UserRole.Administrador, A, "ok", B);
        ActiveChurch(admin).Should().Be(A);
        admin.User.GetProperty("churches").GetArrayLength().Should().Be(2);

        var (res, next) = await SwitchAsync(admin, B);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        ActiveChurch(next!).Should().Be(B);
        var profile = await BreakFactory.ReadJson(await next!.Client.GetAsync("/api/church"));
        profile.GetProperty("id").GetGuid().Should().Be(B);

        // The old refresh token was rotated by the switch: replaying it is theft and ends the sessions.
        var replay = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh") { Headers = { { "Cookie", $"cs_refresh={BreakFactory.CookieValue(admin.Cookie)}" } } };
        (await _f.Anonymous().SendAsync(replay)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Refresh_KeepsTheActiveChurch_AndTakingTheAccessAwayEndsThatSessionAtOnce()
    {
        var super = await NewAsync(UserRole.SuperAdministrador, A, "rf");
        var admin = await NewAsync(UserRole.Administrador, A, "rf", B);
        // Church B keeps its own administrator, so taking this one's access to B away is allowed.
        await CreateAsync(UserRole.Administrador, B, "keeper");
        var (_, inB) = await SwitchAsync(admin, B);
        ActiveChurch(inB!).Should().Be(B);

        // A refresh stays in the church the session was working in.
        var refreshReq = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh") { Headers = { { "Cookie", $"cs_refresh={BreakFactory.CookieValue(inB!.Cookie)}" } } };
        var refreshed = await _f.Anonymous().SendAsync(refreshReq);
        refreshed.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BreakFactory.ReadJson(refreshed)).GetProperty("user").GetProperty("churchId").GetGuid().Should().Be(B);

        // The platform takes church B away: the very next request of that session fails.
        var set = await super.Client.PutAsJsonAsync($"/api/platform/staff/{admin.Id}/churches", new { churchIds = new[] { A } });
        set.StatusCode.Should().Be(HttpStatusCode.OK);
        (await inB.Client.GetAsync("/api/church")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        // Signing in again lands in the home church with the access that is left.
        var again = await SignInAsync(admin.Email, admin.Id);
        ActiveChurch(again).Should().Be(A);
        again.User.GetProperty("churches").GetArrayLength().Should().Be(1);
    }

    // ---- The platform account ------------------------------------------------------------------------------------------

    [Fact]
    public async Task Super_SeesEveryChurch_ActsAsAdministradorInTheActiveOne_AndHasTheGeneralDashboard()
    {
        var super = await NewAsync(UserRole.SuperAdministrador, A, "sp");
        super.User.GetProperty("churches").GetArrayLength().Should().BeGreaterOrEqualTo(3);

        var overview = await BreakFactory.ReadJson(await super.Client.GetAsync("/api/platform/overview"));
        overview.GetProperty("churches").GetArrayLength().Should().BeGreaterOrEqualTo(3);

        var (res, inC) = await SwitchAsync(super, C);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        // Inside the church it can do what an administrator does there.
        (await inC!.Client.GetAsync("/api/staff")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await BreakFactory.ReadJson(await inC.Client.GetAsync("/api/church"))).GetProperty("id").GetGuid().Should().Be(C);
        // And it is not listed as staff of any church.
        var staff = await BreakFactory.ReadJson(await inC.Client.GetAsync("/api/staff"));
        staff.EnumerateArray().Select(e => e.GetProperty("email").GetString()).Should().NotContain(super.Email);
    }

    [Theory]
    [InlineData(UserRole.Administrador)]
    [InlineData(UserRole.Pastor)]
    [InlineData(UserRole.Usuario)]
    public async Task OnlyTheSuper_ReachesThePlatformArea(UserRole role)
    {
        var s = await NewAsync(role, A, "pa");
        (await s.Client.GetAsync("/api/platform/overview")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await s.Client.GetAsync("/api/platform/staff")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await s.Client.PutAsJsonAsync($"/api/platform/staff/{Guid.NewGuid()}/churches", new { churchIds = new[] { A } })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _f.Anonymous().GetAsync("/api/platform/overview")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Overview_ThenAnOrdinaryRequest_StillReadsTheActiveChurch()
    {
        var super = await NewAsync(UserRole.SuperAdministrador, A, "ov");
        (await super.Client.GetAsync("/api/platform/overview")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await BreakFactory.ReadJson(await super.Client.GetAsync("/api/church"))).GetProperty("id").GetGuid().Should().Be(A);
    }

    [Fact]
    public async Task AccessRules_AreEnforcedByThePlatform()
    {
        var super = await NewAsync(UserRole.SuperAdministrador, A, "ar");
        var (_, adminId) = await CreateAsync(UserRole.Administrador, A, "two");
        var (_, pastorId) = await CreateAsync(UserRole.Pastor, A, "pastor");
        var (_, userId) = await CreateAsync(UserRole.Usuario, A, "plain");

        // An administrator may take several churches.
        var ok = await super.Client.PutAsJsonAsync($"/api/platform/staff/{adminId}/churches", new { churchIds = new[] { A, B } });
        ok.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BreakFactory.ReadJson(ok)).GetProperty("churches").GetArrayLength().Should().Be(2);
        // Nobody else does, and the plain account takes none.
        (await super.Client.PutAsJsonAsync($"/api/platform/staff/{pastorId}/churches", new { churchIds = new[] { A, B } })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await super.Client.PutAsJsonAsync($"/api/platform/staff/{userId}/churches", new { churchIds = new[] { B } })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        // Unknown churches, an empty list, and unknown users.
        (await super.Client.PutAsJsonAsync($"/api/platform/staff/{adminId}/churches", new { churchIds = new[] { Guid.NewGuid() } })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await super.Client.PutAsJsonAsync($"/api/platform/staff/{adminId}/churches", new { churchIds = Array.Empty<Guid>() })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await super.Client.PutAsJsonAsync($"/api/platform/staff/{Guid.NewGuid()}/churches", new { churchIds = new[] { A } })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        // Creating an account through the platform follows the same rules, and never creates a super.
        var created = await super.Client.PostAsJsonAsync("/api/platform/staff", new { email = $"n{Guid.NewGuid():N}@acc.local", fullName = "Nuevo", password = Pw, role = 1, churchIds = new[] { B, C } });
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        (await super.Client.PostAsJsonAsync("/api/platform/staff", new { email = $"s{Guid.NewGuid():N}@acc.local", fullName = "S", password = Pw, role = 6, churchIds = new[] { B } })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ARemovedAccess_NeverLeavesAChurchWithoutAnActiveAdministrator()
    {
        var super = await NewAsync(UserRole.SuperAdministrador, A, "la");
        // The only administrator of church C works in C and B: moving them out of C would leave C with none.
        var (_, only) = await CreateAsync(UserRole.Administrador, C, "only", B);
        var res = await super.Client.PutAsJsonAsync($"/api/platform/staff/{only}/churches", new { churchIds = new[] { B } });
        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
        // With a second administrator in C the same change is fine.
        await CreateAsync(UserRole.Administrador, C, "second");
        (await super.Client.PutAsJsonAsync($"/api/platform/staff/{only}/churches", new { churchIds = new[] { B } })).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---- What a church administrator can reach --------------------------------------------------------------------------

    [Fact]
    public async Task ChurchAdministrator_NeverSeesOrChangesThePlatformAccount()
    {
        var (superEmail, superId) = await CreateAsync(UserRole.SuperAdministrador, A, "hid");
        var admin = await NewAsync(UserRole.Administrador, A, "hid");
        var list = await BreakFactory.ReadJson(await admin.Client.GetAsync("/api/staff"));
        list.EnumerateArray().Select(e => e.GetProperty("email").GetString()).Should().NotContain(superEmail);
        foreach (var path in new[] { "role", "deactivate", "activate", "send-reset" })
        {
            var req = path == "role" ? await admin.Client.PutAsJsonAsync($"/api/staff/{superId}/role", new { role = 1 }) : await admin.Client.PostAsync($"/api/staff/{superId}/{path}", null);
            req.StatusCode.Should().Be(HttpStatusCode.NotFound, path);
        }
        // The platform account is intact.
        (await BreakFactory.Login(_f.Anonymous(), superEmail, Pw)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AccountsSharedWithOtherChurches_AreReadOnlyForAChurchAdministrator()
    {
        var (multiEmail, multiId) = await CreateAsync(UserRole.Administrador, A, "multi", B);
        var adminB = await NewAsync(UserRole.Administrador, B, "owner");
        var list = await BreakFactory.ReadJson(await adminB.Client.GetAsync("/api/staff"));
        var row = list.EnumerateArray().Single(e => e.GetProperty("email").GetString() == multiEmail);
        row.GetProperty("isShared").GetBoolean().Should().BeTrue();

        (await adminB.Client.PutAsJsonAsync($"/api/staff/{multiId}/role", new { role = 3 })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await adminB.Client.PostAsync($"/api/staff/{multiId}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await adminB.Client.PostAsync($"/api/staff/{multiId}/send-reset", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await BreakFactory.Login(_f.Anonymous(), multiEmail, Pw)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AnAdministrator_DoesNotSeeTheStaffOfAChurchItDoesNotWorkIn()
    {
        var (otherEmail, otherId) = await CreateAsync(UserRole.Secretario, C, "elsewhere");
        var adminA = await NewAsync(UserRole.Administrador, A, "iso");
        var list = await BreakFactory.ReadJson(await adminA.Client.GetAsync("/api/staff"));
        list.EnumerateArray().Select(e => e.GetProperty("email").GetString()).Should().NotContain(otherEmail);
        (await adminA.Client.PutAsJsonAsync($"/api/staff/{otherId}/role", new { role = 2 })).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ---- The plain account -----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Usuario_IsBlockedFromEveryEndpointThatIsNotExplicitlyOpenToAnySignedInAccount()
    {
        var usuario = await NewAsync(UserRole.Usuario, A, "ux");
        var endpoints = _f.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToList();
        endpoints.Count.Should().BeGreaterThan(30);
        var checkedCount = 0;
        foreach (var e in endpoints)
        {
            var meta = e.Metadata;
            if (meta.GetMetadata<IAllowAnonymous>() is not null) continue;
            var authorize = meta.GetOrderedMetadata<IAuthorizeData>();
            if (authorize.Count == 0) continue;
            // Explicitly open to every signed-in account: the account page and the church switch.
            if (authorize.Any(a => a.Policy == "Authenticated")) continue;
            var methods = meta.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"];
            var path = "/" + System.Text.RegularExpressions.Regex.Replace(e.RoutePattern.RawText!.TrimStart('/'), @"\{[^}]+\}", Guid.NewGuid().ToString());
            foreach (var m in methods.Where(m => m is "GET" or "POST" or "PUT" or "DELETE"))
            {
                var res = await usuario.Client.SendAsync(new HttpRequestMessage(new HttpMethod(m), path) { Content = m == "GET" || m == "DELETE" ? null : JsonContent.Create(new { }) });
                // An upload endpoint is only matched when the request is multipart: ask again the way it expects.
                if (res.StatusCode == HttpStatusCode.UnsupportedMediaType)
                    res = await usuario.Client.SendAsync(new HttpRequestMessage(new HttpMethod(m), path) { Content = new MultipartFormDataContent { { new StringContent("x"), "file", "f.bin" } } });
                res.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{m} {path}");
                checkedCount++;
            }
        }
        checkedCount.Should().BeGreaterThan(30);
        // The account page still works.
        (await usuario.Client.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---- Demonstration accounts never reach a real deployment ------------------------------------------------------------

    [Fact]
    public void DemoSeed_OutsideDevelopment_RefusesToStart()
    {
        using var production = new BreakFactory().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Production");
            b.UseSetting("Seed:Demo", "true");
        });
        var act = () => production.CreateClient();
        act.Should().Throw<Exception>().Which.ToString().Should().Contain("Seed:Demo is only allowed in the Development environment");
    }
}
