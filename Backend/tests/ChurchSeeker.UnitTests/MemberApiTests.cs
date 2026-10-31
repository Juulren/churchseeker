using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

public static class TestUsers
{
    public const string Password = "T3st!Passw0rd#x";

    public static async Task Create(AuthApiFactory f, string email, UserRole role, Guid churchId)
    {
        using var scope = f.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email, FullName = email, ChurchId = churchId };
        (await users.CreateAsync(user, Password)).Succeeded.Should().BeTrue();
        await users.AddToRoleAsync(user, role.ToString());
    }

    public static async Task<HttpClient> ClientFor(AuthApiFactory f, string email)
    {
        var anon = f.CreateClient();
        var res = await anon.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var c = f.CreateClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("accessToken").GetString());
        return c;
    }
}

public class MemberApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public MemberApiTests(AuthApiFactory f) => _f = f;

    private static object Body(string name, string? phone = "999 123 4567", string? email = null, string join = "2024-03-01") =>
        new { fullName = name, phone, email, joinDate = join };

    private async Task<HttpClient> Secretary(Guid church, string tag)
    {
        var email = $"sec-{tag}@m.local";
        await TestUsers.Create(_f, email, UserRole.Secretario, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    [Fact]
    public async Task Crud_RoundTrip_AndSoftDelete()
    {
        var c = await Secretary(ChurchSeedData.CathedralId, "crud");
        var created = await c.PostAsJsonAsync("/api/members", Body("Ana María López", email: "ana@example.com"));
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var id = (await Json(created)).GetProperty("id").GetGuid();

        var upd = await c.PutAsJsonAsync($"/api/members/{id}", Body("Ana M. López", "999 000 1111", "ana2@example.com", "2023-01-10"));
        upd.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(upd)).GetProperty("fullName").GetString().Should().Be("Ana M. López");

        (await c.DeleteAsync($"/api/members/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        // Row still exists, only deactivated.
        var after = await Json(await c.GetAsync($"/api/members/{id}"));
        after.GetProperty("isActive").GetBoolean().Should().BeFalse();

        var re = await c.PostAsync($"/api/members/{id}/activate", null);
        (await Json(re)).GetProperty("isActive").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task List_FiltersBySearchAndStatus_AndPaginates()
    {
        var c = await Secretary(ChurchSeedData.JesusId, "list");
        foreach (var n in new[] { "Beatriz Uc", "Carlos Pech", "Carla Canul", "Diego Chan", "Elena Pool" })
            (await c.PostAsJsonAsync("/api/members", Body(n))).StatusCode.Should().Be(HttpStatusCode.Created);

        var cars = await Json(await c.GetAsync("/api/members?search=car"));
        cars.GetProperty("total").GetInt32().Should().Be(2);

        var p1 = await Json(await c.GetAsync("/api/members?pageSize=2&page=1"));
        var p3 = await Json(await c.GetAsync("/api/members?pageSize=2&page=3"));
        p1.GetProperty("items").GetArrayLength().Should().Be(2);
        p3.GetProperty("items").GetArrayLength().Should().Be(1);
        p1.GetProperty("total").GetInt32().Should().Be(5);

        var id = (await Json(await c.GetAsync("/api/members?search=Diego"))).GetProperty("items")[0].GetProperty("id").GetGuid();
        await c.DeleteAsync($"/api/members/{id}");
        (await Json(await c.GetAsync("/api/members?active=false"))).GetProperty("total").GetInt32().Should().Be(1);
        (await Json(await c.GetAsync("/api/members?active=true"))).GetProperty("total").GetInt32().Should().Be(4);
    }

    [Fact]
    public async Task Search_WildcardsAreLiteral_AndOversizeRejected()
    {
        var c = await Secretary(ChurchSeedData.SantaLuciaId, "like");
        await c.PostAsJsonAsync("/api/members", Body("Pedro Pérez"));
        (await Json(await c.GetAsync("/api/members?search=%25"))).GetProperty("total").GetInt32().Should().Be(0);
        (await Json(await c.GetAsync("/api/members?search=_edro"))).GetProperty("total").GetInt32().Should().Be(0);
        (await c.GetAsync("/api/members?search=" + new string('a', 101))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("", "999 123 4567", null, "2024-01-01")]
    [InlineData("   ", null, null, "2024-01-01")]
    [InlineData("<script>alert(1)</script>", null, null, "2024-01-01")]
    [InlineData("Ok Name", "abc", null, "2024-01-01")]
    [InlineData("Ok Name", null, "not-an-email", "2024-01-01")]
    [InlineData("Ok Name", null, "a@b.c, d@e.f", "2024-01-01")]
    [InlineData("Ok Name", null, null, "2999-01-01")]
    [InlineData("Ok Name", null, null, "1800-01-01")]
    public async Task Create_InvalidInput_400(string name, string? phone, string? email, string join)
    {
        var c = await Secretary(ChurchSeedData.CathedralId, "val" + Guid.NewGuid().ToString("N")[..6]);
        (await c.PostAsJsonAsync("/api/members", Body(name, phone, email, join))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task OtherChurchMember_Is404_ForReadUpdateDeleteActivate()
    {
        var a = await Secretary(ChurchSeedData.CathedralId, "iso-a");
        var b = await Secretary(ChurchSeedData.JesusId, "iso-b");
        var id = (await Json(await a.PostAsJsonAsync("/api/members", Body("Solo Catedral")))).GetProperty("id").GetGuid();

        (await b.GetAsync($"/api/members/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PutAsJsonAsync($"/api/members/{id}", Body("Hijack"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.DeleteAsync($"/api/members/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PostAsync($"/api/members/{id}/activate", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Json(await b.GetAsync("/api/members?search=Solo"))).GetProperty("total").GetInt32().Should().Be(0);
        (await Json(await a.GetAsync($"/api/members/{id}"))).GetProperty("fullName").GetString().Should().Be("Solo Catedral");
    }

    [Fact]
    public async Task Payload_CannotChooseChurchOrActiveFlag()
    {
        var c = await Secretary(ChurchSeedData.CathedralId, "mass");
        var json = $"{{\"fullName\":\"Mass Assign\",\"joinDate\":\"2024-01-01\",\"churchId\":\"{ChurchSeedData.JesusId}\",\"isActive\":false,\"id\":\"{Guid.NewGuid()}\"}}";
        var res = await c.PostAsync("/api/members", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await Json(res);
        body.GetProperty("isActive").GetBoolean().Should().BeTrue();

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var m = await db.Members.IgnoreQueryFilters().SingleAsync(x => x.Id == body.GetProperty("id").GetGuid());
        m.ChurchId.Should().Be(ChurchSeedData.CathedralId);
    }

    [Theory]
    [InlineData(UserRole.Tesorero)]
    [InlineData(UserRole.Coordinador)]
    public async Task OtherRoles_CannotTouchMembers(UserRole role)
    {
        var email = $"{role}-m@m.local".ToLower();
        await TestUsers.Create(_f, email, role, ChurchSeedData.CathedralId);
        var c = await TestUsers.ClientFor(_f, email);
        (await c.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.PostAsJsonAsync("/api/members", Body("Nope"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Anonymous_401()
    {
        (await _f.CreateClient().GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Changes_AreAudited_WithoutPersonalData()
    {
        var c = await Secretary(ChurchSeedData.SantaLuciaId, "aud");
        var id = (await Json(await c.PostAsJsonAsync("/api/members", Body("Auditada Secreta", "999 777 8888", "priv@example.com")))).GetProperty("id").GetGuid();
        await c.PutAsJsonAsync($"/api/members/{id}", Body("Auditada Secreta", "999 777 9999", "priv@example.com"));

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logs = await db.AuditLogs.AsNoTracking().Where(l => l.EntityId == id.ToString()).ToListAsync();
        logs.Select(l => l.Action).Should().Contain(["Member.Created", "Member.Updated"]);
        string.Join("|", logs.Select(l => l.Details + l.EntityName)).Should()
            .NotContain("Secreta").And.NotContain("9999").And.NotContain("priv@");
    }
}
