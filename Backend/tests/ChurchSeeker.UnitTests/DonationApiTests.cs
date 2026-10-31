using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

public class DonationApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public DonationApiTests(AuthApiFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@don.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static object Don(decimal amount = 100m, string date = "2025-05-04", string concept = "Diezmo", int method = 1, Guid? member = null) =>
        new { date, amount, concept, method, memberId = member };

    private static StringContent Raw(string json) => new(json, Encoding.UTF8, "application/json");

    [Fact]
    public async Task Anonymous_And_Identified_Donations_RoundTrip()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "rt");
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "rt-s");
        var member = (await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = "Donante Conocido", joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();

        var anon = await t.PostAsJsonAsync("/api/donations", Don(250.50m));
        anon.StatusCode.Should().Be(HttpStatusCode.Created);
        var a = await Json(anon);
        a.GetProperty("isAnonymous").GetBoolean().Should().BeTrue();
        a.GetProperty("memberId").ValueKind.Should().Be(JsonValueKind.Null);
        a.GetProperty("amount").GetDecimal().Should().Be(250.50m);

        var known = await Json(await t.PostAsJsonAsync("/api/donations", Don(99.99m, member: member)));
        known.GetProperty("isAnonymous").GetBoolean().Should().BeFalse();
        (await Json(await t.GetAsync($"/api/donations/{known.GetProperty("id").GetGuid()}"))).GetProperty("memberId").GetGuid().Should().Be(member);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-5000.00")]
    [InlineData("0.001")]
    [InlineData("12.345")]
    [InlineData("100000000.01")]
    [InlineData("79228162514264337593543950335")]
    public async Task InvalidAmounts_400(string amount)
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "amt" + Guid.NewGuid().ToString("N")[..8]);
        var res = await t.PostAsync("/api/donations", Raw($"{{\"date\":\"2025-05-04\",\"amount\":{amount},\"concept\":\"x\",\"method\":1}}"));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("\"NaN\"")]
    [InlineData("\"Infinity\"")]
    [InlineData("1e400")]
    [InlineData("\"abc\"")]
    [InlineData("null")]
    [InlineData("[]")]
    public async Task NonNumericAmounts_4xx_Never5xx(string amount)
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "nan" + Guid.NewGuid().ToString("N")[..8]);
        var res = await t.PostAsync("/api/donations", Raw($"{{\"date\":\"2025-05-04\",\"amount\":{amount},\"concept\":\"x\",\"method\":1}}"));
        ((int)res.StatusCode).Should().BeInRange(400, 499);
    }

    [Fact]
    public async Task OtherInvalidFields_400()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "inv");
        (await t.PostAsJsonAsync("/api/donations", Don(date: DateTime.UtcNow.AddDays(10).ToString("yyyy-MM-dd")))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.PostAsJsonAsync("/api/donations", Don(date: "1999-01-01"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.PostAsJsonAsync("/api/donations", Don(concept: ""))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.PostAsJsonAsync("/api/donations", Don(concept: "<script>alert(1)</script>"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.PostAsJsonAsync("/api/donations", Don(method: 99))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.PostAsJsonAsync("/api/donations", Don(member: Guid.NewGuid()))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task MemberOfAnotherChurch_Rejected()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "xm");
        var other = await As(UserRole.Secretario, ChurchSeedData.JesusId, "xm-s");
        var foreign = (await Json(await other.PostAsJsonAsync("/api/members", new { fullName = "Ajeno", joinDate = "2024-01-01" }))).GetProperty("id").GetGuid();
        (await t.PostAsJsonAsync("/api/donations", Don(member: foreign))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task List_FiltersTotalsAndExcludesVoided()
    {
        var t = await As(UserRole.Administrador, ChurchSeedData.SantaLuciaId, "list");
        await t.PostAsJsonAsync("/api/donations", Don(100m, "2024-01-10", "Enero A", 1));
        await t.PostAsJsonAsync("/api/donations", Don(50.25m, "2024-01-20", "Enero B", 2));
        var gone = (await Json(await t.PostAsJsonAsync("/api/donations", Don(1000m, "2024-02-05", "Anulada", 1)))).GetProperty("id").GetGuid();
        await t.PostAsJsonAsync("/api/donations", Don(10m, "2024-02-06", "Feb", 1));
        await t.PostAsync($"/api/donations/{gone}/void", null);

        var all = await Json(await t.GetAsync("/api/donations?from=2024-01-01&to=2024-12-31"));
        all.GetProperty("total").GetInt32().Should().Be(3);
        all.GetProperty("totalAmount").GetDecimal().Should().Be(160.25m);

        var jan = await Json(await t.GetAsync("/api/donations?from=2024-01-01&to=2024-01-31"));
        jan.GetProperty("totalAmount").GetDecimal().Should().Be(150.25m);
        (await Json(await t.GetAsync("/api/donations?from=2024-01-01&to=2024-12-31&method=2"))).GetProperty("total").GetInt32().Should().Be(1);
        (await Json(await t.GetAsync("/api/donations?from=2024-01-01&to=2024-12-31&includeVoided=true"))).GetProperty("total").GetInt32().Should().Be(4);
        (await t.GetAsync("/api/donations?from=2024-12-31&to=2024-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task MonthlySummary_SumsExactly_AndSeparatesAnonymous()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.JesusId, "month");
        var sec = await As(UserRole.Secretario, ChurchSeedData.JesusId, "month-s");
        var m = (await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = "Mensual", joinDate = "2020-01-01" }))).GetProperty("id").GetGuid();
        await t.PostAsJsonAsync("/api/donations", Don(0.10m, "2023-03-01"));
        await t.PostAsJsonAsync("/api/donations", Don(0.20m, "2023-03-02"));
        await t.PostAsJsonAsync("/api/donations", Don(1.00m, "2023-03-03", member: m));
        await t.PostAsJsonAsync("/api/donations", Don(5m, "2023-04-01"));

        var rows = await Json(await t.GetAsync("/api/donations/summary/monthly?year=2023"));
        rows.GetArrayLength().Should().Be(12);
        var march = rows[2];
        march.GetProperty("count").GetInt32().Should().Be(3);
        march.GetProperty("total").GetDecimal().Should().Be(1.30m, "0.10 + 0.20 must be exactly 0.30");
        march.GetProperty("anonymousCount").GetInt32().Should().Be(2);
        march.GetProperty("anonymousTotal").GetDecimal().Should().Be(0.30m);
        rows[3].GetProperty("total").GetDecimal().Should().Be(5m);
        (await t.GetAsync("/api/donations/summary/monthly?year=1800")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData(UserRole.Pastor)]
    [InlineData(UserRole.Secretario)]
    [InlineData(UserRole.Coordinador)]
    public async Task NonFinanceRoles_AreForbiddenEverywhere(UserRole role)
    {
        var c = await As(role, ChurchSeedData.CathedralId, "deny");
        (await c.GetAsync("/api/donations")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.PostAsJsonAsync("/api/donations", Don())).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.GetAsync("/api/donations/summary/monthly?year=2025")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.GetAsync($"/api/donations/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await c.PostAsync($"/api/donations/{Guid.NewGuid()}/void", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Anonymous_Caller_401_And_NoEditOrDeleteRoutes()
    {
        (await _f.CreateClient().GetAsync("/api/donations")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "noedit");
        var id = (await Json(await t.PostAsJsonAsync("/api/donations", Don()))).GetProperty("id").GetGuid();
        (await t.PutAsJsonAsync($"/api/donations/{id}", Don(1m))).StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        (await t.DeleteAsync($"/api/donations/{id}")).StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task OtherChurch_Donation_Is404_AndNotInTotals()
    {
        var a = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "iso-a");
        var b = await As(UserRole.Tesorero, ChurchSeedData.JesusId, "iso-b");
        var id = (await Json(await a.PostAsJsonAsync("/api/donations", Don(777m, "2022-06-06")))).GetProperty("id").GetGuid();
        (await b.GetAsync($"/api/donations/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PostAsync($"/api/donations/{id}/void", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Json(await b.GetAsync("/api/donations?from=2022-01-01&to=2022-12-31"))).GetProperty("totalAmount").GetDecimal().Should().Be(0m);
        (await Json(await a.GetAsync($"/api/donations/{id}"))).GetProperty("isVoided").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task AnonymousDonation_LeavesNoTraceOfAnyMember_InAuditOrRow()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "trace");
        var id = (await Json(await t.PostAsJsonAsync("/api/donations", Don(321m, concept: "Sobre cerrado")))).GetProperty("id").GetGuid();
        await t.PostAsync($"/api/donations/{id}/void", null);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Donations.IgnoreQueryFilters().SingleAsync(d => d.Id == id)).MemberId.Should().BeNull();
        var logs = await db.AuditLogs.AsNoTracking().Where(l => l.EntityId == id.ToString()).ToListAsync();
        logs.Select(l => l.Action).Should().Contain("Donation.Created");
        string.Join("|", logs.Select(l => l.Details + l.EntityName)).Should().NotContain("321").And.NotContain("Sobre").And.NotContain("MemberId");
    }
}

