using System.Net;
using System.Net.Http.Json;
using System.Text;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.BreakTests;

// Phase 2 break tests: injection, hostile dates, physical deletes, races and fuzzed query strings.
public class Phase2BreakTests : IClassFixture<BreakFactory>
{
    private readonly BreakFactory _f;
    private static readonly Guid Cathedral = ChurchSeedData.CathedralId;
    private static readonly Guid Jesus = ChurchSeedData.JesusId;

    public Phase2BreakTests(BreakFactory f) => _f = f;

    private static StringContent Raw(string json) => new(json, Encoding.UTF8, "application/json");

    private static async Task<Guid> NewMember(HttpClient c, string name) =>
        (await BreakFactory.ReadJson(await c.PostAsJsonAsync("/api/members", new { fullName = name, joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();

    private static async Task<Guid> NewEvent(HttpClient c, string date) =>
        (await BreakFactory.ReadJson(await c.PostAsJsonAsync("/api/events",
            new { title = "Evento", date, time = "10:00:00", location = "Nave", kind = 1, isPublic = true }))).GetProperty("id").GetGuid();

    // ---- SQL injection -----------------------------------------------------------------

    public static IEnumerable<object[]> SqlPayloads() =>
    [
        ["' OR 1=1 --"], ["' OR '1'='1"], ["'; DROP TABLE Members; --"], ["\" OR \"\"=\""],
        ["' UNION SELECT Id, PasswordHash FROM AspNetUsers --"], ["%' OR 1=1 --"], ["\\' OR 1=1 --"], ["1; WAITFOR DELAY '0:0:5'--"]
    ];

    [Theory]
    [MemberData(nameof(SqlPayloads))]
    public async Task MemberSearch_SqlInjection_ReturnsNothing_AndTablesSurvive(string payload)
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "sqli" + Math.Abs(payload.GetHashCode()));
        await NewMember(c, "Visible Person");
        var res = await c.GetAsync("/api/members?search=" + Uri.EscapeDataString(payload));
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BreakFactory.ReadJson(res)).GetProperty("total").GetInt32().Should().Be(0, "an injected predicate must never widen the result");

        (await c.GetAsync("/api/members")).StatusCode.Should().Be(HttpStatusCode.OK);
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Members.IgnoreQueryFilters().AnyAsync()).Should().BeTrue("the Members table must still exist");
    }

    [Fact]
    public async Task SqlPayloadsAsStoredValues_AreStoredInertly()
    {
        var c = await _f.UserClient(UserRole.Pastor, Cathedral, "sqli-store");
        var name = "Robert'); DROP TABLE Members;--";
        var res = await c.PostAsJsonAsync("/api/members", new { fullName = name, joinDate = "2024-01-01" });
        res.StatusCode.Should().Be(HttpStatusCode.Created);
        (await BreakFactory.ReadJson(await c.GetAsync("/api/members?search=" + Uri.EscapeDataString("DROP TABLE"))))
            .GetProperty("total").GetInt32().Should().BeGreaterThan(0);
    }

    // ---- Stored XSS ----------------------------------------------------------------------

    public static IEnumerable<object[]> XssPayloads() =>
    [
        ["<script>alert(1)</script>"], ["<img src=x onerror=alert(1)>"], ["\"><svg/onload=alert(1)>"],
        ["<iframe src=javascript:alert(1)>"], ["x<b>y"], ["a>b"]
    ];

    [Theory]
    [MemberData(nameof(XssPayloads))]
    public async Task Markup_IsRejectedInEveryTextField(string payload)
    {
        var c = await _f.UserClient(UserRole.Pastor, Cathedral, "xss" + Math.Abs(payload.GetHashCode()));
        (await c.PostAsJsonAsync("/api/members", new { fullName = payload, joinDate = "2024-01-01" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/members", new { fullName = "Ok", email = payload, joinDate = "2024-01-01" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/events", new { title = payload, date = "2026-01-01", time = "10:00:00", location = "x", kind = 1 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/events", new { title = "Ok", description = payload, date = "2026-01-01", time = "10:00:00", location = "x", kind = 1 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/events", new { title = "Ok", date = "2026-01-01", time = "10:00:00", location = payload, kind = 1 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/ministries", new { name = payload })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/ministries", new { name = "Ok-" + Guid.NewGuid().ToString("N")[..6], description = payload })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ---- Hostile dates and shapes ----------------------------------------------------------

    public static IEnumerable<object[]> BadEventBodies() =>
    [
        ["{\"title\":\"x\",\"date\":\"2026-02-30\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":\"\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":\"0000-00-00\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":\"99999-01-01\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":\"2026-01-01\",\"time\":\"25:61\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":\"2026-01-01\",\"time\":\"-1\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":12345,\"time\":\"10:00\",\"location\":\"y\",\"kind\":1}"],
        ["{\"title\":\"x\",\"date\":\"2026-01-01\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":\"Religioso;DROP\"}"],
        ["{\"title\":\"x\",\"date\":\"2026-01-01\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":99999999999}"],
        ["{\"title\":\"x\",\"date\":\"2026-01-01\",\"time\":\"10:00\",\"location\":\"y\",\"kind\":1,\"responsibleMemberId\":\"not-a-guid\"}"],
        ["[1,2,3]"], ["\"just a string\""], ["{"], [""]
    ];

    [Theory]
    [MemberData(nameof(BadEventBodies))]
    public async Task HostileEventBodies_Are4xx_Never5xx(string body)
    {
        var c = await _f.UserClient(UserRole.Pastor, Cathedral, "date" + Math.Abs(body.GetHashCode()));
        var res = await c.PostAsync("/api/events", Raw(body));
        ((int)res.StatusCode).Should().BeInRange(400, 499);
    }

    [Fact]
    public async Task OversizedFields_AreRejected()
    {
        var c = await _f.UserClient(UserRole.Pastor, Cathedral, "big");
        (await c.PostAsJsonAsync("/api/members", new { fullName = new string('a', 201), joinDate = "2024-01-01" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/events", new { title = "x", description = new string('d', 4001), date = "2026-01-01", time = "10:00:00", location = "y", kind = 1 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/ministries", new { name = new string('m', 151) })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ---- Physical deletes ------------------------------------------------------------------

    [Fact]
    public async Task Member_CannotBePhysicallyDeleted_ThroughApi()
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "nodel");
        var id = await NewMember(c, "No me borres");
        (await c.DeleteAsync($"/api/members/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Members.IgnoreQueryFilters().SingleAsync(m => m.Id == id);
        row.IsActive.Should().BeFalse("DELETE only deactivates");
    }

    [Fact]
    public async Task EveryPhysicalDelete_FailsAtTheDataLayer()
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "dl-layer");
        var memberId = await NewMember(c, "Capa de datos");
        var eventId = await NewEvent(c, "2025-01-05");

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var member = await db.Members.IgnoreQueryFilters().SingleAsync(m => m.Id == memberId);
        db.Members.Remove(member);
        await FluentActions.Awaiting(() => db.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        db.ChangeTracker.Clear();

        var ev = await db.Events.IgnoreQueryFilters().SingleAsync(e => e.Id == eventId);
        db.Events.Remove(ev);
        await FluentActions.Awaiting(() => db.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        db.ChangeTracker.Clear();
        (await db.Members.IgnoreQueryFilters().AnyAsync(m => m.Id == memberId)).Should().BeTrue();
    }

    [Theory]
    [InlineData("events")]
    [InlineData("ministries")]
    public async Task NoDeleteRoutes_ForEventsAndMinistries(string resource)
    {
        var c = await _f.UserClient(UserRole.Administrador, Cathedral, "norte" + resource);
        var res = await c.DeleteAsync($"/api/{resource}/{Guid.NewGuid()}");
        res.StatusCode.Should().BeOneOf(HttpStatusCode.MethodNotAllowed, HttpStatusCode.NotFound);
    }

    // ---- Races ----------------------------------------------------------------------------

    [Fact]
    public async Task ParallelAttendance_OverlappingBatches_KeepOneRowPerMember_NoServerErrors()
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "race-att");
        var members = new List<Guid>();
        for (var i = 0; i < 8; i++) members.Add(await NewMember(c, $"Racer {i}"));
        var ev = await NewEvent(c, "2025-01-12");

        var calls = Enumerable.Range(0, 30).Select(i =>
        {
            var slice = members.Skip(i % 4).Take(5).Select(id => new { memberId = id, present = i % 2 == 0 }).ToArray();
            return c.PutAsJsonAsync($"/api/events/{ev}/attendance", new { entries = slice });
        });
        var results = await Task.WhenAll(calls);

        results.Should().OnlyContain(r => (int)r.StatusCode < 500);
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rows = await db.Attendances.IgnoreQueryFilters().Where(a => a.EventId == ev).ToListAsync();
        rows.GroupBy(a => a.MemberId).Should().OnlyContain(g => g.Count() == 1);
    }

    [Fact]
    public async Task ParallelMinistryCreation_SameName_ExactlyOneWins()
    {
        var c = await _f.UserClient(UserRole.Pastor, Cathedral, "race-min");
        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => c.PostAsJsonAsync("/api/ministries", new { name = "Ministerio Carrera" })));
        results.Should().OnlyContain(r => (int)r.StatusCode < 500);
        results.Count(r => r.StatusCode == HttpStatusCode.Created).Should().Be(1);
        results.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(11);
    }

    // ---- Fuzzed query strings ----------------------------------------------------------------

    public static IEnumerable<object[]> FuzzUrls() =>
    [
        ["/api/members?page=-1&pageSize=-5"], ["/api/members?page=0&pageSize=99999999"], ["/api/members?page=abc"],
        ["/api/members?active=maybe"], ["/api/members?search=%00%00"], ["/api/members?search=%F0%9F%92%A5%F0%9F%92%A5"],
        ["/api/members?page=2147483647&pageSize=2147483647"], ["/api/members?search=" + "%25".PadRight(300, '5')],
        ["/api/events?from=garbage"], ["/api/events?from=9999-12-31&to=0001-01-01"], ["/api/events?page=-10"],
        ["/api/attendance/summary"], ["/api/attendance/summary?from=2026-01-01"], ["/api/attendance/summary?from=x&to=y&period=z"],
        ["/api/ministries/not-a-guid"], ["/api/ministries/00000000-0000-0000-0000-000000000000/members"],
        ["/api/members/00000000-0000-0000-0000-000000000000/attendance?page=-3"]
    ];

    [Theory]
    [MemberData(nameof(FuzzUrls))]
    public async Task FuzzedQueries_NeverProduce5xx(string url)
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "fuzz" + Math.Abs(url.GetHashCode()));
        var res = await c.GetAsync(url);
        ((int)res.StatusCode).Should().BeLessThan(500, url);
    }

    // ---- Isolation under guessing --------------------------------------------------------------

    [Fact]
    public async Task GuessingIds_AcrossChurches_NeverLeaks()
    {
        var a = await _f.UserClient(UserRole.Secretario, Cathedral, "guess-a");
        var b = await _f.UserClient(UserRole.Secretario, Jesus, "guess-b");
        var member = await NewMember(a, "Secreto de A");
        var ev = await NewEvent(a, "2025-02-02");
        var min = (await BreakFactory.ReadJson(await a.PostAsJsonAsync("/api/ministries", new { name = "Secreto A" }))).GetProperty("id").GetGuid();

        foreach (var url in new[] { $"/api/members/{member}", $"/api/members/{member}/attendance", $"/api/events/{ev}", $"/api/events/{ev}/attendance",
                                    $"/api/ministries/{min}", $"/api/ministries/{min}/members", $"/api/ministries/{min}/events" })
            (await b.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.NotFound, url);

        // Same-looking ids for non-existent rows answer identically: no existence oracle.
        (await b.GetAsync($"/api/members/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task PublicCalendar_NeverShowsPrivateEvents_EvenWithTrickyQueries()
    {
        var c = await _f.UserClient(UserRole.Secretario, Jesus, "pub-priv");
        await c.PostAsJsonAsync("/api/events", new { title = "PRIVADO-SECRETO", date = "2027-03-01", time = "10:00:00", location = "x", kind = 2, isPublic = false });
        var anon = _f.Anonymous();
        foreach (var q in new[] { "", "?from=2027-03-01&to=2027-03-01", "?isPublic=false", "?includePrivate=true&from=2027-03-01&to=2027-03-31", "?from=2027-03-01&to=2027-03-01&%27%20OR%201=1--=x" })
        {
            var res = await anon.GetAsync($"/api/public/churches/{Jesus}/events{q}");
            (await res.Content.ReadAsStringAsync()).Should().NotContain("PRIVADO-SECRETO", q);
        }
    }

    [Fact]
    public async Task PublicCalendar_Scraping_HitsRateLimit()
    {
        var anon = _f.Anonymous();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 80; i++) codes.Add((await anon.GetAsync($"/api/public/churches/{Cathedral}/events")).StatusCode);
        codes.Should().Contain(HttpStatusCode.TooManyRequests);
        codes.Should().OnlyContain(s => s == HttpStatusCode.OK || s == HttpStatusCode.TooManyRequests);
    }
}
