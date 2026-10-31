using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChurchSeeker.UnitTests;

public class EventApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public EventApiTests(AuthApiFactory f) => _f = f;

    private static object Ev(string title = "Misa dominical", string date = "2026-11-01", string time = "09:00:00",
                             bool isPublic = true, Guid? responsible = null, int kind = 1, string? desc = "Misa principal",
                             string location = "Nave central") =>
        new { title, description = desc, date, time, location, kind, isPublic, responsibleMemberId = responsible };

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@e.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    [Fact]
    public async Task Crud_Cancel_Restore_NoDelete()
    {
        var c = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "crud");
        var created = await c.PostAsJsonAsync("/api/events", Ev());
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var id = (await Json(created)).GetProperty("id").GetGuid();

        var upd = await c.PutAsJsonAsync($"/api/events/{id}", Ev("Misa solemne", time: "11:30:00", kind: 2));
        (await Json(upd)).GetProperty("title").GetString().Should().Be("Misa solemne");

        (await Json(await c.PostAsync($"/api/events/{id}/cancel", null))).GetProperty("isCancelled").GetBoolean().Should().BeTrue();
        (await Json(await c.PostAsync($"/api/events/{id}/restore", null))).GetProperty("isCancelled").GetBoolean().Should().BeFalse();
        (await c.DeleteAsync($"/api/events/{id}")).StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task Responsible_MustBeActiveMemberOfSameChurch()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "resp-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "resp-b");
        var mine = (await Json(await a.PostAsJsonAsync("/api/members", new { fullName = "Resp A", joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();
        var theirs = (await Json(await b.PostAsJsonAsync("/api/members", new { fullName = "Resp B", joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();

        (await a.PostAsJsonAsync("/api/events", Ev(responsible: mine))).StatusCode.Should().Be(HttpStatusCode.Created);
        (await a.PostAsJsonAsync("/api/events", Ev(responsible: theirs))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await a.PostAsJsonAsync("/api/events", Ev(responsible: Guid.NewGuid()))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        await a.DeleteAsync($"/api/members/{mine}");
        (await a.PostAsJsonAsync("/api/events", Ev(responsible: mine))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("", "2026-11-01", "09:00:00", 1, "Nave")]
    [InlineData("<script>alert(1)</script>", "2026-11-01", "09:00:00", 1, "Nave")]
    [InlineData("Ok", "1999-12-31", "09:00:00", 1, "Nave")]
    [InlineData("Ok", "2101-01-01", "09:00:00", 1, "Nave")]
    [InlineData("Ok", "2026-11-01", "09:00:00", 99, "Nave")]
    [InlineData("Ok", "2026-11-01", "09:00:00", 1, "")]
    [InlineData("Ok", "2026-11-01", "09:00:00", 1, "<img src=x onerror=alert(1)>")]
    public async Task InvalidEvents_400(string title, string date, string time, int kind, string location)
    {
        var c = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "inv" + Guid.NewGuid().ToString("N")[..6]);
        (await c.PostAsJsonAsync("/api/events", Ev(title, date, time, kind: kind, location: location))).StatusCode
            .Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task InvalidDateFormat_Is400_NotServerError()
    {
        var c = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "badfmt");
        var res = await c.PostAsync("/api/events", new StringContent(
            "{\"title\":\"x\",\"date\":\"31/02/2026\",\"time\":\"25:99\",\"location\":\"y\",\"kind\":1}", Encoding.UTF8, "application/json"));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Internal_ReadOpenToStaff_WriteOnlyManagement()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "rw-sec");
        await sec.PostAsJsonAsync("/api/events", Ev(isPublic: false));
        foreach (var role in new[] { UserRole.Tesorero, UserRole.Coordinador })
        {
            var c = await As(role, ChurchSeedData.SantaLuciaId, "rw");
            (await c.GetAsync("/api/events")).StatusCode.Should().Be(HttpStatusCode.OK);
            (await c.PostAsJsonAsync("/api/events", Ev())).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        (await _f.CreateClient().GetAsync("/api/events")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OtherChurch_Event_Is404_ForReadUpdateCancel()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "iso-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "iso-b");
        var id = (await Json(await a.PostAsJsonAsync("/api/events", Ev("Solo Catedral")))).GetProperty("id").GetGuid();

        (await b.GetAsync($"/api/events/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PutAsJsonAsync($"/api/events/{id}", Ev("Hijack"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PostAsync($"/api/events/{id}/cancel", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Json(await b.GetAsync("/api/events"))).GetProperty("items").EnumerateArray()
            .Should().NotContain(e => e.GetProperty("id").GetGuid() == id);
    }

    [Fact]
    public async Task List_FiltersByDateRange_AndRejectsInvertedRange()
    {
        var c = await As(UserRole.Secretario, ChurchSeedData.JesusId, "range");
        foreach (var d in new[] { "2027-01-05", "2027-02-10", "2027-03-15" })
            await c.PostAsJsonAsync("/api/events", Ev($"E {d}", d));
        var r = await Json(await c.GetAsync("/api/events?from=2027-02-01&to=2027-02-28"));
        r.GetProperty("total").GetInt32().Should().Be(1);
        (await c.GetAsync("/api/events?from=2027-03-01&to=2027-02-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PublicCalendar_ShowsOnlyPublicEventsOfThatChurch_ToAnonymous()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "pub-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "pub-b");
        var member = (await Json(await a.PostAsJsonAsync("/api/members", new { fullName = "Responsable Privado", joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();
        await a.PostAsJsonAsync("/api/events", Ev("A publico", "2027-05-01", responsible: member));
        await a.PostAsJsonAsync("/api/events", Ev("A privado", "2027-05-02", isPublic: false));
        await b.PostAsJsonAsync("/api/events", Ev("B publico", "2027-05-03"));

        var res = await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.CathedralId}/events?from=2027-05-01&to=2027-05-31");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var text = await res.Content.ReadAsStringAsync();
        text.Should().Contain("A publico").And.NotContain("A privado").And.NotContain("B publico");
        text.Should().NotContain(member.ToString()).And.NotContain("responsibleMemberId").And.NotContain("isPublic");
    }

    [Fact]
    public async Task PublicCalendar_SignedInUserOfOtherChurch_StillGetsRequestedChurch()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "x-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "x-b");
        await a.PostAsJsonAsync("/api/events", Ev("Catedral X", "2027-06-01"));
        await b.PostAsJsonAsync("/api/events", Ev("Jesus X", "2027-06-02"));

        var text = await (await b.GetAsync($"/api/public/churches/{ChurchSeedData.CathedralId}/events?from=2027-06-01&to=2027-06-30")).Content.ReadAsStringAsync();
        text.Should().Contain("Catedral X").And.NotContain("Jesus X");
    }

    [Fact]
    public async Task PublicCalendar_CancelledEventsAreFlagged_UnknownChurch404_BadRanges400()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "pub-c");
        var id = (await Json(await a.PostAsJsonAsync("/api/events", Ev("Cancelada", "2027-07-01")))).GetProperty("id").GetGuid();
        await a.PostAsync($"/api/events/{id}/cancel", null);

        var anon = _f.CreateClient();
        var body = await Json(await anon.GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/events?from=2027-07-01&to=2027-07-31"));
        body.EnumerateArray().Single(e => e.GetProperty("id").GetGuid() == id).GetProperty("isCancelled").GetBoolean().Should().BeTrue();

        (await anon.GetAsync($"/api/public/churches/{Guid.NewGuid()}/events")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await anon.GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/events?from=2027-01-01&to=2029-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await anon.GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/events?from=2027-02-01&to=2027-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await anon.GetAsync("/api/public/churches/not-a-guid/events")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
