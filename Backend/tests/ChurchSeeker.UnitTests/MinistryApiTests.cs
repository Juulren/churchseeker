using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

public class MinistryApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public MinistryApiTests(AuthApiFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@min.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private async Task<Guid> UserId(string email)
    {
        using var scope = _f.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        return (await users.FindByEmailAsync(email))!.Id;
    }

    private static async Task<Guid> NewMinistry(HttpClient c, string name, Guid? coordinator = null) =>
        (await Json(await c.PostAsJsonAsync("/api/ministries", new { name, description = "desc", coordinatorUserId = coordinator }))).GetProperty("id").GetGuid();

    private static async Task<Guid> NewMember(HttpClient c, string name) =>
        (await Json(await c.PostAsJsonAsync("/api/members", new { fullName = name, joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();

    [Fact]
    public async Task Crud_NameUniquePerChurch_CaseInsensitive()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "crud");
        var id = await NewMinistry(sec, "Música");
        (await sec.PostAsJsonAsync("/api/ministries", new { name = "música" })).StatusCode.Should().Be(HttpStatusCode.Conflict);

        var upd = await sec.PutAsJsonAsync($"/api/ministries/{id}", new { name = "Música y Alabanza", description = "Coro" });
        (await Json(upd)).GetProperty("name").GetString().Should().Be("Música y Alabanza");
        var other = await NewMinistry(sec, "Jóvenes");
        (await sec.PutAsJsonAsync($"/api/ministries/{other}", new { name = "música y alabanza" })).StatusCode.Should().Be(HttpStatusCode.Conflict);

        // Same name in another church is fine.
        var jesus = await As(UserRole.Secretario, ChurchSeedData.JesusId, "crud2");
        (await jesus.PostAsJsonAsync("/api/ministries", new { name = "Jóvenes" })).StatusCode.Should().Be(HttpStatusCode.Created);

        (await sec.PostAsync($"/api/ministries/{id}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(await sec.GetAsync($"/api/ministries/{id}"))).GetProperty("isActive").GetBoolean().Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("<b>x</b>")]
    public async Task InvalidName_400(string name)
    {
        var sec = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "bad" + name.Length);
        (await sec.PostAsJsonAsync("/api/ministries", new { name })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Coordinator_MustBeActiveCoordinadorOfSameChurch()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "coord");
        await As(UserRole.Coordinador, ChurchSeedData.CathedralId, "c-ok");
        await As(UserRole.Coordinador, ChurchSeedData.JesusId, "c-other");
        await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "c-treasurer");

        var ok = await UserId("coordinador-c-ok@min.local");
        var otherChurch = await UserId("coordinador-c-other@min.local");
        var wrongRole = await UserId("tesorero-c-treasurer@min.local");

        (await sec.PostAsJsonAsync("/api/ministries", new { name = "Con coord", coordinatorUserId = ok })).StatusCode.Should().Be(HttpStatusCode.Created);
        (await sec.PostAsJsonAsync("/api/ministries", new { name = "Otra iglesia", coordinatorUserId = otherChurch })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await sec.PostAsJsonAsync("/api/ministries", new { name = "Rol equivocado", coordinatorUserId = wrongRole })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await sec.PostAsJsonAsync("/api/ministries", new { name = "Fantasma", coordinatorUserId = Guid.NewGuid() })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Coordinator_SeesAndManagesOnlyOwnMinistry()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "scope");
        var coord = await As(UserRole.Coordinador, ChurchSeedData.SantaLuciaId, "scope");
        var coordId = await UserId("coordinador-scope@min.local");
        var mine = await NewMinistry(sec, "Niños", coordId);
        var notMine = await NewMinistry(sec, "Enseñanza");
        var member = await NewMember(sec, "Niño Uno");

        (await Json(await coord.GetAsync("/api/ministries"))).GetArrayLength().Should().Be(1);
        (await coord.GetAsync($"/api/ministries/{notMine}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await coord.GetAsync($"/api/ministries/{notMine}/members")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await coord.PutAsync($"/api/ministries/{notMine}/members/{member}", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await coord.PutAsync($"/api/ministries/{mine}/members/{member}", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(await coord.GetAsync($"/api/ministries/{mine}/members"))).GetArrayLength().Should().Be(1);

        // A coordinator cannot create, rename or reassign ministries.
        (await coord.PostAsJsonAsync("/api/ministries", new { name = "Nuevo" })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await coord.PutAsJsonAsync($"/api/ministries/{mine}", new { name = "Renombrado", coordinatorUserId = coordId })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await coord.PostAsync($"/api/ministries/{mine}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Membership_AddIsIdempotent_RemoveKeepsHistory_ReaddReactivates()
    {
        var sec = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "memb");
        var min = await NewMinistry(sec, "Servicio");
        var m = await NewMember(sec, "Servidor");

        (await sec.PutAsync($"/api/ministries/{min}/members/{m}", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        var again = await Json(await sec.PutAsync($"/api/ministries/{min}/members/{m}", null));
        again.GetArrayLength().Should().Be(1);
        (await Json(await sec.GetAsync($"/api/ministries/{min}"))).GetProperty("memberCount").GetInt32().Should().Be(1);

        (await Json(await sec.DeleteAsync($"/api/ministries/{min}/members/{m}"))).GetArrayLength().Should().Be(0);
        (await sec.DeleteAsync($"/api/ministries/{min}/members/{m}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Json(await sec.PutAsync($"/api/ministries/{min}/members/{m}", null))).GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task ConcurrentAdds_NeverDuplicateOrCrash()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.JesusId, "race");
        var min = await NewMinistry(sec, "Carrera");
        var m = await NewMember(sec, "Corredor");
        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => sec.PutAsync($"/api/ministries/{min}/members/{m}", null)));
        results.Should().OnlyContain(r => (int)r.StatusCode < 500);
        (await Json(await sec.GetAsync($"/api/ministries/{min}/members"))).GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task CrossChurch_Isolation()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "iso-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "iso-b");
        var minA = await NewMinistry(a, "Solo A");
        var memberB = await NewMember(b, "Miembro B");
        var memberA = await NewMember(a, "Miembro A");

        (await b.GetAsync($"/api/ministries/{minA}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PutAsync($"/api/ministries/{minA}/members/{memberB}", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PutAsJsonAsync($"/api/ministries/{minA}", new { name = "Hijack" })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await a.PutAsync($"/api/ministries/{minA}/members/{memberB}", null)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await a.PutAsync($"/api/ministries/{minA}/members/{memberA}", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(await b.GetAsync("/api/ministries"))).EnumerateArray().Should().NotContain(x => x.GetProperty("id").GetGuid() == minA);
    }

    [Fact]
    public async Task ScheduledActivities_AreEventsLinkedToTheMinistry()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "acts");
        var min = await NewMinistry(sec, "Actividades");
        var other = await NewMinistry(sec, "Otro");
        Task<HttpResponseMessage> Ev(string title, string date, Guid? ministry) => sec.PostAsJsonAsync("/api/events",
            new { title, date, time = "18:00:00", location = "Salón", kind = 1, isPublic = false, ministryId = ministry });

        (await Ev("Ensayo", "2027-02-01", min)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await Ev("Otro ensayo", "2027-02-08", other)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await Ev("Sin ministerio", "2027-02-09", null)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await Ev("Ministerio falso", "2027-02-10", Guid.NewGuid())).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var list = await Json(await sec.GetAsync($"/api/ministries/{min}/events?from=2027-01-01&to=2027-12-31"));
        list.GetArrayLength().Should().Be(1);
        list[0].GetProperty("title").GetString().Should().Be("Ensayo");
        (await sec.GetAsync($"/api/ministries/{min}/events?from=2027-12-31&to=2027-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Treasurer_And_Anonymous_AreBlocked()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "blocked");
        (await t.GetAsync("/api/ministries")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _f.CreateClient().GetAsync("/api/ministries")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
