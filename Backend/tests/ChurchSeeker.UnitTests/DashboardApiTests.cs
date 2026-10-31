using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChurchSeeker.UnitTests;

public class DashboardApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public DashboardApiTests(AuthApiFactory f) => _f = f;

    private static string D(int offset) => DateTime.UtcNow.AddDays(offset).ToString("yyyy-MM-dd");

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@dash.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    // The fixture (one DB) is shared by every test of this class, so seed exactly once.
    private static readonly object SeedLock = new();
    private static Task? _seed;
    private Task SeedSantaLucia() { lock (SeedLock) { return _seed ??= SeedCore(); } }

    private async Task SeedCore()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "seed");
        var treasurer = await As(UserRole.Tesorero, ChurchSeedData.SantaLuciaId, "seed-t");

        var ids = new List<Guid>();
        foreach (var n in new[] { "Uno", "Dos", "Tres" })
            ids.Add((await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = n, joinDate = "2024-01-01" }))).GetProperty("id").GetGuid());
        await sec.DeleteAsync($"/api/members/{ids[2]}");

        await sec.PostAsJsonAsync("/api/ministries", new { name = "Activo" });
        var gone = (await Json(await sec.PostAsJsonAsync("/api/ministries", new { name = "Inactivo" }))).GetProperty("id").GetGuid();
        await sec.PostAsync($"/api/ministries/{gone}/deactivate", null);

        async Task<Guid> Ev(string title, int offset) =>
            (await Json(await sec.PostAsJsonAsync("/api/events", new { title, date = D(offset), time = "10:00:00", location = "Nave", kind = 1, isPublic = true }))).GetProperty("id").GetGuid();
        var today = await Ev("Hoy", 0);
        await Ev("En cinco", 5);
        await Ev("Lejano", 40);
        await sec.PostAsync($"/api/events/{await Ev("Cancelado", 3)}/cancel", null);

        await sec.PutAsJsonAsync($"/api/events/{today}/attendance", new { entries = new[]
        {
            new { memberId = ids[0], present = true }, new { memberId = ids[1], present = true }
        }});

        foreach (var (amount, date) in new[] { (100.50m, D(0)), (20m, D(0)), (999m, $"{DateTime.UtcNow.Year - 1}-06-01") })
            await treasurer.PostAsJsonAsync("/api/donations", new { date, amount, concept = "Aporte", method = 1 });
    }

    [Fact]
    public async Task Kpis_AreAccurate_ForTheCallersChurchOnly()
    {
        await SeedSantaLucia();
        var staff = await As(UserRole.Coordinador, ChurchSeedData.SantaLuciaId, "kpi");
        var k = (await Json(await staff.GetAsync("/api/dashboard"))).GetProperty("kpis");
        k.GetProperty("activeMembers").GetInt32().Should().Be(2);
        k.GetProperty("upcomingEvents").GetInt32().Should().Be(2);
        k.GetProperty("attendancesThisMonth").GetInt32().Should().Be(2);
        k.GetProperty("activeMinistries").GetInt32().Should().Be(1);

        var other = await As(UserRole.Pastor, ChurchSeedData.JesusId, "kpi-other");
        var o = (await Json(await other.GetAsync("/api/dashboard"))).GetProperty("kpis");
        o.GetProperty("activeMembers").GetInt32().Should().Be(0);
        o.GetProperty("upcomingEvents").GetInt32().Should().Be(0);
        o.GetProperty("attendancesThisMonth").GetInt32().Should().Be(0);
        o.GetProperty("activeMinistries").GetInt32().Should().Be(0);
    }

    [Theory]
    [InlineData(UserRole.Administrador)]
    [InlineData(UserRole.Tesorero)]
    public async Task FinanceRoles_SeeIncome(UserRole role)
    {
        await SeedSantaLucia();
        var c = await As(role, ChurchSeedData.SantaLuciaId, "inc");
        var income = (await Json(await c.GetAsync("/api/dashboard"))).GetProperty("income");
        income.GetProperty("year").GetInt32().Should().Be(DateTime.UtcNow.Year);
        income.GetProperty("monthToDate").GetDecimal().Should().Be(120.50m);
        income.GetProperty("yearToDate").GetDecimal().Should().Be(120.50m, "last year's donation must not count");
        income.GetProperty("monthly").GetArrayLength().Should().Be(12);
    }

    [Theory]
    [InlineData(UserRole.Pastor)]
    [InlineData(UserRole.Secretario)]
    [InlineData(UserRole.Coordinador)]
    public async Task OtherRoles_NeverReceiveIncome_NotEvenAsNull(UserRole role)
    {
        await SeedSantaLucia();
        var c = await As(role, ChurchSeedData.SantaLuciaId, "noinc");
        var res = await c.GetAsync("/api/dashboard");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var text = await res.Content.ReadAsStringAsync();
        text.Should().NotContainEquivalentOf("income").And.NotContain("120.5").And.NotContain("monthToDate").And.NotContain("yearToDate");
        text.Should().Contain("kpis");
    }

    [Fact]
    public async Task AttendanceChart_HasThisWeeksData_AndAnonymousIs401()
    {
        await SeedSantaLucia();
        var c = await As(UserRole.Pastor, ChurchSeedData.SantaLuciaId, "chart");
        var weeks = (await Json(await c.GetAsync("/api/dashboard"))).GetProperty("attendanceByWeek");
        weeks.GetArrayLength().Should().BeGreaterThan(0);
        weeks.EnumerateArray().Sum(w => w.GetProperty("present").GetInt32()).Should().Be(2);
        (await _f.CreateClient().GetAsync("/api/dashboard")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
