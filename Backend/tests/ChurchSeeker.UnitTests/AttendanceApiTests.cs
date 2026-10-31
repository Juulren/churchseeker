using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

public class AttendanceApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public AttendanceApiTests(AuthApiFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> Sec(Guid church, string tag)
    {
        var email = $"sec-{tag}@a.local";
        await TestUsers.Create(_f, email, UserRole.Secretario, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static async Task<Guid> NewMember(HttpClient c, string name) =>
        (await Json(await c.PostAsJsonAsync("/api/members", new { fullName = name, joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();

    private static async Task<Guid> NewEvent(HttpClient c, string date, string title = "Culto") =>
        (await Json(await c.PostAsJsonAsync("/api/events",
            new { title, date, time = "10:00:00", location = "Nave", kind = 1, isPublic = true }))).GetProperty("id").GetGuid();

    private static object Entries(params (Guid Id, bool Present)[] e) =>
        new { entries = e.Select(x => new { memberId = x.Id, present = x.Present }).ToArray() };

    [Fact]
    public async Task Record_ThenChange_IsUpsert_NoDuplicates()
    {
        var c = await Sec(ChurchSeedData.CathedralId, "upsert");
        var m1 = await NewMember(c, "Uno"); var m2 = await NewMember(c, "Dos"); var m3 = await NewMember(c, "Tres");
        var ev = await NewEvent(c, "2025-02-02");

        var first = await c.PutAsJsonAsync($"/api/events/{ev}/attendance", Entries((m1, true), (m2, true), (m3, false)));
        first.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(first);
        body.GetProperty("present").GetInt32().Should().Be(2);
        body.GetProperty("absent").GetInt32().Should().Be(1);

        var second = await Json(await c.PutAsJsonAsync($"/api/events/{ev}/attendance", Entries((m2, false), (m3, true))));
        second.GetProperty("rows").GetArrayLength().Should().Be(3);
        second.GetProperty("present").GetInt32().Should().Be(2);

        var get = await Json(await c.GetAsync($"/api/events/{ev}/attendance"));
        get.GetProperty("rows").GetArrayLength().Should().Be(3);
    }

    [Fact]
    public async Task InvalidRequests_400()
    {
        var c = await Sec(ChurchSeedData.CathedralId, "inv");
        var m = await NewMember(c, "Inv");
        var ev = await NewEvent(c, "2025-02-09");

        (await c.PutAsJsonAsync($"/api/events/{ev}/attendance", Entries((m, true), (m, false)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PutAsJsonAsync($"/api/events/{ev}/attendance", new { entries = Array.Empty<object>() })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var many = Enumerable.Range(0, 1001).Select(_ => new { memberId = Guid.NewGuid(), present = true }).ToArray();
        (await c.PutAsJsonAsync($"/api/events/{ev}/attendance", new { entries = many })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PutAsJsonAsync($"/api/events/{ev}/attendance", Entries((Guid.NewGuid(), true)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PutAsync($"/api/events/{ev}/attendance", new StringContent("null", System.Text.Encoding.UTF8, "application/json")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task FutureOrCancelledEvent_Rejected_InactiveMemberRejected()
    {
        var c = await Sec(ChurchSeedData.CathedralId, "rules");
        var m = await NewMember(c, "Rules");
        var future = await NewEvent(c, DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd"));
        (await c.PutAsJsonAsync($"/api/events/{future}/attendance", Entries((m, true)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var cancelled = await NewEvent(c, "2025-03-01");
        await c.PostAsync($"/api/events/{cancelled}/cancel", null);
        (await c.PutAsJsonAsync($"/api/events/{cancelled}/attendance", Entries((m, true)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var ok = await NewEvent(c, "2025-03-02");
        await c.DeleteAsync($"/api/members/{m}");
        (await c.PutAsJsonAsync($"/api/events/{ok}/attendance", Entries((m, true)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CrossChurch_MemberAndEvent_AreRejected()
    {
        var a = await Sec(ChurchSeedData.CathedralId, "x-a");
        var b = await Sec(ChurchSeedData.JesusId, "x-b");
        var ma = await NewMember(a, "De A"); var mb = await NewMember(b, "De B");
        var ea = await NewEvent(a, "2025-04-06"); var eb = await NewEvent(b, "2025-04-06");

        (await a.PutAsJsonAsync($"/api/events/{ea}/attendance", Entries((mb, true)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await a.PutAsJsonAsync($"/api/events/{eb}/attendance", Entries((ma, true)))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await a.GetAsync($"/api/events/{eb}/attendance")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await a.GetAsync($"/api/members/{mb}/attendance")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ConcurrentDuplicateRecording_NeverDuplicatesOrCrashes()
    {
        var c = await Sec(ChurchSeedData.SantaLuciaId, "conc");
        var m = await NewMember(c, "Concurrente");
        var ev = await NewEvent(c, "2025-05-04");

        var calls = Enumerable.Range(0, 12).Select(i =>
            c.PutAsJsonAsync($"/api/events/{ev}/attendance", Entries((m, i % 2 == 0)))).ToArray();
        var results = await Task.WhenAll(calls);

        results.Should().OnlyContain(r => (int)r.StatusCode < 500);
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Attendances.IgnoreQueryFilters().CountAsync(a => a.EventId == ev && a.MemberId == m)).Should().Be(1);
    }

    [Fact]
    public async Task Database_RejectsDuplicateRow_EvenBypassingTheService()
    {
        var c = await Sec(ChurchSeedData.JesusId, "dbdup");
        var m = await NewMember(c, "Dup"); var ev = await NewEvent(c, "2025-06-01");
        await c.PutAsJsonAsync($"/api/events/{ev}/attendance", Entries((m, true)));

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Attendances.Add(new Attendance(ChurchSeedData.JesusId, ev, m, false));
        await FluentActions.Awaiting(() => db.SaveChangesAsync()).Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task MemberHistory_IsPaged_NewestFirst()
    {
        var c = await Sec(ChurchSeedData.CathedralId, "hist");
        var m = await NewMember(c, "Historial");
        foreach (var d in new[] { "2025-07-06", "2025-07-13", "2025-07-20" })
            await c.PutAsJsonAsync($"/api/events/{await NewEvent(c, d, "Culto " + d)}/attendance", Entries((m, d != "2025-07-13")));

        var p1 = await Json(await c.GetAsync($"/api/members/{m}/attendance?pageSize=2"));
        p1.GetProperty("total").GetInt32().Should().Be(3);
        p1.GetProperty("items")[0].GetProperty("title").GetString().Should().Be("Culto 2025-07-20");
        (await Json(await c.GetAsync($"/api/members/{m}/attendance?pageSize=2&page=2"))).GetProperty("items").GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task Summary_GroupsByWeekAndMonth_AndValidatesRange()
    {
        var c = await Sec(ChurchSeedData.SantaLuciaId, "sum");
        var m1 = await NewMember(c, "S1"); var m2 = await NewMember(c, "S2");
        var e1 = await NewEvent(c, "2024-03-04"); // Monday
        var e2 = await NewEvent(c, "2024-03-06"); // Wednesday, same week
        var e3 = await NewEvent(c, "2024-03-11"); // next week
        await c.PutAsJsonAsync($"/api/events/{e1}/attendance", Entries((m1, true), (m2, false)));
        await c.PutAsJsonAsync($"/api/events/{e2}/attendance", Entries((m1, true), (m2, true)));
        await c.PutAsJsonAsync($"/api/events/{e3}/attendance", Entries((m2, true)));

        var weeks = await Json(await c.GetAsync("/api/attendance/summary?from=2024-03-01&to=2024-03-31&period=Week"));
        weeks.GetArrayLength().Should().Be(2);
        weeks[0].GetProperty("periodStart").GetString().Should().Be("2024-03-04");
        weeks[0].GetProperty("events").GetInt32().Should().Be(2);
        weeks[0].GetProperty("present").GetInt32().Should().Be(3);
        weeks[0].GetProperty("absent").GetInt32().Should().Be(1);
        weeks[0].GetProperty("distinctMembersPresent").GetInt32().Should().Be(2);

        var months = await Json(await c.GetAsync("/api/attendance/summary?from=2024-03-01&to=2024-03-31&period=Month"));
        months.GetArrayLength().Should().Be(1);
        months[0].GetProperty("events").GetInt32().Should().Be(3);
        months[0].GetProperty("present").GetInt32().Should().Be(4);

        (await c.GetAsync("/api/attendance/summary?from=2024-03-31&to=2024-03-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.GetAsync("/api/attendance/summary?from=2020-01-01&to=2024-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.GetAsync("/api/attendance/summary?from=2024-03-01&to=2024-03-31&period=Decade")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Summary_OnlyCountsOwnChurch()
    {
        var a = await Sec(ChurchSeedData.CathedralId, "sum-a");
        var b = await Sec(ChurchSeedData.JesusId, "sum-b");
        var mb = await NewMember(b, "B member");
        await b.PutAsJsonAsync($"/api/events/{await NewEvent(b, "2023-09-03")}/attendance", Entries((mb, true)));
        (await Json(await a.GetAsync("/api/attendance/summary?from=2023-09-01&to=2023-09-30&period=Month"))).GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task Roles_OnlyManagement()
    {
        var t = $"treasurer-att@a.local";
        await TestUsers.Create(_f, t, UserRole.Tesorero, ChurchSeedData.CathedralId);
        var c = await TestUsers.ClientFor(_f, t);
        (await c.GetAsync($"/api/events/{Guid.NewGuid()}/attendance")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.GetAsync("/api/attendance/summary?from=2024-01-01&to=2024-02-01")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _f.CreateClient().GetAsync($"/api/events/{Guid.NewGuid()}/attendance")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
