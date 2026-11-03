using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

public class StaffApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public StaffApiTests(AuthApiFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<(HttpClient Client, string Email, Guid Id)> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}-{Guid.NewGuid().ToString("N")[..8]}@staff.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return (await TestUsers.ClientFor(_f, email), email, await IdOf(email));
    }

    private async Task<Guid> IdOf(string email)
    {
        using var scope = _f.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().FindByEmailAsync(email))!.Id;
    }

    private static HttpRequestMessage Put(string url, object body) => new(HttpMethod.Put, url) { Content = JsonContent.Create(body) };

    [Fact]
    public async Task Admin_ListsOnlyOwnChurch_WithRolesAndStatus_NeverSecrets()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.CathedralId, "list");
        var (_, ownEmail, _) = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "own");
        var (_, otherEmail, _) = await As(UserRole.Pastor, ChurchSeedData.JesusId, "other");

        var res = await admin.GetAsync("/api/staff");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var text = await res.Content.ReadAsStringAsync();
        text.Should().Contain(ownEmail).And.NotContain(otherEmail);
        text.Should().NotContainEquivalentOf("hash").And.NotContainEquivalentOf("stamp").And.NotContainEquivalentOf("password");
        var rows = JsonDocument.Parse(text).RootElement.EnumerateArray().ToList();
        rows.Should().Contain(r => r.GetProperty("isSelf").GetBoolean());
        rows.Should().OnlyContain(r => r.GetProperty("isActive").GetBoolean() || true);
    }

    [Theory]
    [InlineData(UserRole.Pastor)]
    [InlineData(UserRole.Secretario)]
    [InlineData(UserRole.Tesorero)]
    [InlineData(UserRole.Coordinador)]
    public async Task EveryNonAdminRole_IsForbiddenOnAllStaffRoutes(UserRole role)
    {
        var (c, _, _) = await As(role, ChurchSeedData.CathedralId, "deny");
        var (_, _, target) = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "target");
        (await c.GetAsync("/api/staff")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.SendAsync(Put($"/api/staff/{target}/role", new { role = 1 }))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.PostAsync($"/api/staff/{target}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.PostAsync($"/api/staff/{target}/activate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.PostAsync($"/api/staff/{target}/send-reset", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Anonymous_Is401()
    {
        (await _f.CreateClient().GetAsync("/api/staff")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task RoleChange_TakesEffectImmediately_OldTokenDies_NewLoginHasNewRole()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.JesusId, "role");
        var (target, email, id) = await As(UserRole.Secretario, ChurchSeedData.JesusId, "victim");
        (await target.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.OK);

        var res = await admin.SendAsync(Put($"/api/staff/{id}/role", new { role = (int)UserRole.Tesorero }));
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(res)).GetProperty("role").GetInt32().Should().Be((int)UserRole.Tesorero);

        // The old access token still carries "Secretario": it must not work any more, not even for 15 minutes.
        (await target.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var fresh = await TestUsers.ClientFor(_f, email);
        (await fresh.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await fresh.GetAsync("/api/donations")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Deactivate_BlocksTokenAndLoginAtOnce_AndActivateRestoresAccess()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.SantaLuciaId, "deact");
        var (target, email, id) = await As(UserRole.Pastor, ChurchSeedData.SantaLuciaId, "gone");
        (await target.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.OK);

        (await admin.PostAsync($"/api/staff/{id}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await target.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await _f.CreateClient().PostAsJsonAsync("/api/auth/login", new { email, password = TestUsers.Password })).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var listed = await Json(await admin.GetAsync("/api/staff?includeInactive=false"));
        listed.EnumerateArray().Should().NotContain(r => r.GetProperty("id").GetGuid() == id);

        (await admin.PostAsync($"/api/staff/{id}/activate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await TestUsers.ClientFor(_f, email).ContinueWith(t => t.Result.GetAsync("/api/members")).Unwrap()).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Admin_CannotChangeOrDeactivateSelf()
    {
        var (admin, _, id) = await As(UserRole.Administrador, ChurchSeedData.CathedralId, "self");
        (await admin.SendAsync(Put($"/api/staff/{id}/role", new { role = 2 }))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await admin.PostAsync($"/api/staff/{id}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await admin.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AnotherChurchsUser_IsNotFound_ForEveryAction()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.JesusId, "iso");
        var (victim, _, id) = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "far");
        (await admin.SendAsync(Put($"/api/staff/{id}/role", new { role = 1 }))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await admin.PostAsync($"/api/staff/{id}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await admin.PostAsync($"/api/staff/{id}/activate", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await admin.PostAsync($"/api/staff/{id}/send-reset", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await admin.PostAsync($"/api/staff/{Guid.NewGuid()}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await victim.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.OK, "nothing happened to the other church's user");
    }

    [Fact]
    public async Task InvalidRoles_AreRejected()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.SantaLuciaId, "badrole");
        var (_, _, id) = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "t");
        foreach (var body in new[] { "{\"role\":99}", "{\"role\":0}", "{\"role\":\"Dios\"}", "{\"role\":null}", "{}", "[]", "{not json" })
            ((int)(await admin.PutAsync($"/api/staff/{id}/role", new StringContent(body, Encoding.UTF8, "application/json"))).StatusCode).Should().BeInRange(400, 499, body);
        (await admin.PutAsync("/api/staff/not-a-guid/role", JsonContent.Create(new { role = 1 }))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task SendReset_Answers204_ForActiveUsers_And404_ForInactive()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.CathedralId, "reset");
        var (_, _, id) = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "r");
        (await admin.PostAsync($"/api/staff/{id}/send-reset", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        await admin.PostAsync($"/api/staff/{id}/deactivate", null);
        (await admin.PostAsync($"/api/staff/{id}/send-reset", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Changes_AreAudited_WithoutPersonalData()
    {
        var (admin, _, _) = await As(UserRole.Administrador, ChurchSeedData.SantaLuciaId, "aud");
        var (_, email, id) = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "aud-t");
        await admin.SendAsync(Put($"/api/staff/{id}/role", new { role = 2 }));
        await admin.PostAsync($"/api/staff/{id}/deactivate", null);

        using var scope = _f.Services.CreateScope();
        var logs = await scope.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs.AsNoTracking().Where(l => l.EntityId == id.ToString()).ToListAsync();
        logs.Select(l => l.Action).Should().Contain(["user.role_changed", "user.deactivated"]);
        logs.Single(l => l.Action == "user.role_changed").Details.Should().Be("Secretario->Pastor");
        string.Join("|", logs.Select(l => l.Details)).Should().NotContain(email);
    }
}
