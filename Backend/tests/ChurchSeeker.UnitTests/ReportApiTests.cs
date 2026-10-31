using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using ClosedXML.Excel;
using FluentAssertions;

namespace ChurchSeeker.UnitTests;

public class ReportApiTests : IClassFixture<AuthApiFactory>, IClassFixture<LowLimitFactory>
{
    private readonly AuthApiFactory _f;
    private readonly LowLimitFactory _low;

    public ReportApiTests(AuthApiFactory f, LowLimitFactory low)
    {
        _f = f;
        _low = low;
    }

    private static string D(int offset) => DateTime.UtcNow.AddDays(offset).ToString("yyyy-MM-dd");

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@rep.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static IXLWorksheet Sheet(byte[] xlsx)
    {
        var wb = new XLWorkbook(new MemoryStream(xlsx));
        return wb.Worksheet(1);
    }

    private static string[] Column(IXLWorksheet ws, int column) =>
        ws.Column(column).CellsUsed().Select(c => c.GetString()).ToArray();

    private static string Text(IXLWorksheet ws) => string.Join("|", ws.CellsUsed().Select(c => c.GetString()));

    [Fact]
    public async Task MembersReport_Xlsx_HasHeadersRowsAndOnlyOwnChurch()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "mem");
        var other = await As(UserRole.Secretario, ChurchSeedData.JesusId, "mem-o");
        await sec.PostAsJsonAsync("/api/members", new { fullName = "Ana Reporte", phone = "999 123 4567", email = "ana@r.mx", joinDate = "2023-02-03" });
        var inactive = (await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = "Beto Inactivo", joinDate = "2023-02-03" }))).GetProperty("id").GetGuid();
        await sec.DeleteAsync($"/api/members/{inactive}");
        await other.PostAsJsonAsync("/api/members", new { fullName = "Intruso De Otra Iglesia", joinDate = "2023-02-03" });

        var res = await sec.GetAsync("/api/reports/members?format=Xlsx");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        res.Content.Headers.ContentType!.MediaType.Should().Be("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.Content.Headers.ContentDisposition!.FileName.Should().MatchRegex(@"^reporte-members-\d{8}\.xlsx$");

        var ws = Sheet(await res.Content.ReadAsByteArrayAsync());
        ws.Cell(4, 1).GetString().Should().Be("Nombre");
        var text = Text(ws);
        text.Should().Contain("Ana Reporte").And.Contain("2023-02-03").And.Contain("Beto Inactivo").And.NotContain("Intruso");

        var onlyActive = Sheet(await (await sec.GetAsync("/api/reports/members?format=Xlsx&active=true")).Content.ReadAsByteArrayAsync());
        Text(onlyActive).Should().Contain("Ana Reporte").And.NotContain("Beto Inactivo");
    }

    [Fact]
    public async Task EveryReport_ExportsValidPdfAndXlsx()
    {
        var sec = await As(UserRole.Pastor, ChurchSeedData.SantaLuciaId, "all");
        var treasurer = await As(UserRole.Tesorero, ChurchSeedData.SantaLuciaId, "all-t");
        await sec.PostAsJsonAsync("/api/ministries", new { name = "Reportes" });
        await treasurer.PostAsJsonAsync("/api/donations", new { date = D(0), amount = 10.5m, concept = "x", method = 1 });

        var management = new[] { "members", "ministries", $"attendance?from={D(-30)}&to={D(0)}" };
        foreach (var path in management)
        {
            var sep = path.Contains('?') ? "&" : "?";
            var pdf = await sec.GetAsync($"/api/reports/{path}{sep}format=Pdf");
            pdf.StatusCode.Should().Be(HttpStatusCode.OK, path);
            pdf.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
            var bytes = await pdf.Content.ReadAsByteArrayAsync();
            bytes.Length.Should().BeGreaterThan(500);
            bytes.Take(5).Should().Equal("%PDF-"u8.ToArray());

            var xlsx = await sec.GetAsync($"/api/reports/{path}{sep}format=Xlsx");
            xlsx.StatusCode.Should().Be(HttpStatusCode.OK, path);
            (await xlsx.Content.ReadAsByteArrayAsync()).Take(2).Should().Equal("PK"u8.ToArray());
        }
        foreach (var fmt in new[] { "Pdf", "Xlsx" })
            (await treasurer.GetAsync($"/api/reports/income?format={fmt}&from={D(-60)}&to={D(0)}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task IncomeReport_SumsExactly_AndNeverListsDonors()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.JesusId, "inc");
        var sec = await As(UserRole.Secretario, ChurchSeedData.JesusId, "inc-s");
        var m = (await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = "Donante Secreto Nombre", joinDate = "2020-01-01" }))).GetProperty("id").GetGuid();
        await t.PostAsJsonAsync("/api/donations", new { date = "2022-03-05", amount = 0.10m, concept = "a", method = 1 });
        await t.PostAsJsonAsync("/api/donations", new { date = "2022-03-06", amount = 0.20m, concept = "b", method = 2 });
        await t.PostAsJsonAsync("/api/donations", new { date = "2022-03-07", amount = 5m, concept = "c", method = 1, memberId = m });
        var voided = (await Json(await t.PostAsJsonAsync("/api/donations", new { date = "2022-03-08", amount = 1000m, concept = "d", method = 1 }))).GetProperty("id").GetGuid();
        await t.PostAsync($"/api/donations/{voided}/void", null);

        var ws = Sheet(await (await t.GetAsync("/api/reports/income?format=Xlsx&from=2022-03-01&to=2022-04-30")).Content.ReadAsByteArrayAsync());
        ws.Cell(5, 1).GetString().Should().Be("2022-03");
        ws.Cell(5, 2).GetDouble().Should().Be(3);
        ws.Cell(5, 3).GetDouble().Should().BeApproximately(5.30, 1e-9);
        ws.Cell(5, 4).GetDouble().Should().Be(2);
        ws.Cell(5, 5).GetDouble().Should().BeApproximately(0.30, 1e-9);
        ws.Cell(6, 1).GetString().Should().Be("2022-04");
        Text(ws).Should().Contain("Total general: 5.30").And.NotContain("Donante Secreto").And.NotContain("1000");
    }

    [Fact]
    public async Task AttendanceReport_PerEventDetailAndRange()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "att");
        var m1 = (await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = "Presente Uno", joinDate = "2020-01-01" }))).GetProperty("id").GetGuid();
        var m2 = (await Json(await sec.PostAsJsonAsync("/api/members", new { fullName = "Ausente Dos", joinDate = "2020-01-01" }))).GetProperty("id").GetGuid();
        var ev = (await Json(await sec.PostAsJsonAsync("/api/events", new { title = "Culto reporte", date = "2022-05-01", time = "10:00:00", location = "Nave", kind = 1 }))).GetProperty("id").GetGuid();
        await sec.PutAsJsonAsync($"/api/events/{ev}/attendance", new { entries = new[] { new { memberId = m1, present = true }, new { memberId = m2, present = false } } });

        var detail = Sheet(await (await sec.GetAsync($"/api/reports/attendance?format=Xlsx&eventId={ev}")).Content.ReadAsByteArrayAsync());
        Text(detail).Should().Contain("Presente Uno|Presente").And.Contain("Ausente Dos|Ausente").And.Contain("Presentes: 1");

        var range = Sheet(await (await sec.GetAsync("/api/reports/attendance?format=Xlsx&from=2022-05-01&to=2022-05-31")).Content.ReadAsByteArrayAsync());
        Text(range).Should().Contain("Culto reporte");
        range.Cell(5, 3).GetDouble().Should().Be(1);
        range.Cell(5, 4).GetDouble().Should().Be(1);

        (await sec.GetAsync("/api/reports/attendance?format=Pdf")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await sec.GetAsync("/api/reports/attendance?format=Pdf&from=2022-01-01&to=2024-12-31")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await sec.GetAsync($"/api/reports/attendance?format=Pdf&eventId={Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task SpreadsheetFormulaInjection_IsNeutralised()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "inj");
        foreach (var name in new[] { "=HYPERLINK(\"http://evil\",\"x\")", "@SUM(1+1)", "+cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0" })
            await sec.PostAsJsonAsync("/api/members", new { fullName = name, joinDate = "2020-01-01" });

        var ws = Sheet(await (await sec.GetAsync("/api/reports/members?format=Xlsx")).Content.ReadAsByteArrayAsync());
        var risky = new[] { "=HYPERLINK(\"http://evil\",\"x\")", "@SUM(1+1)", "+cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0" };
        // ClosedXML turns the leading quote into Excel's quote-prefix flag: the value stays text and is never evaluated.
        var cells = ws.CellsUsed().Where(c => risky.Contains(c.GetString())).ToList();
        cells.Should().HaveCount(4);
        cells.Should().OnlyContain(c => c.DataType == XLDataType.Text && !c.HasFormula && c.Style.IncludeQuotePrefix);        ws.CellsUsed().Should().OnlyContain(c => !c.HasFormula);
    }

    [Fact]
    public async Task Roles_MatchThePlan()
    {
        var pastor = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "r-p");
        var treasurer = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "r-t");
        var coordinator = await As(UserRole.Coordinador, ChurchSeedData.CathedralId, "r-c");

        (await pastor.GetAsync($"/api/reports/income?from={D(-10)}&to={D(0)}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        foreach (var path in new[] { "members", "ministries", $"attendance?from={D(-10)}&to={D(0)}" })
        {
            (await treasurer.GetAsync($"/api/reports/{path}")).StatusCode.Should().Be(HttpStatusCode.Forbidden, path);
            (await coordinator.GetAsync($"/api/reports/{path}")).StatusCode.Should().Be(HttpStatusCode.Forbidden, path);
        }
        (await coordinator.GetAsync($"/api/reports/income?from={D(-10)}&to={D(0)}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _f.CreateClient().GetAsync("/api/reports/members")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await _f.CreateClient().GetAsync("/api/reports/income")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task InvalidFormatsAndRanges_400()
    {
        var t = await As(UserRole.Administrador, ChurchSeedData.JesusId, "bad");
        (await t.GetAsync("/api/reports/members?format=Docx")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.GetAsync("/api/reports/members?format=99")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.GetAsync("/api/reports/income?format=Pdf")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.GetAsync("/api/reports/income?format=Pdf&from=2020-01-01&to=2030-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await t.GetAsync("/api/reports/income?format=Pdf&from=2024-05-01&to=2024-01-01")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Exports_AreAudited_WithoutData()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.JesusId, "aud");
        await sec.PostAsJsonAsync("/api/members", new { fullName = "Auditada Reporte", joinDate = "2020-01-01" });
        await sec.GetAsync("/api/reports/members?format=Pdf");

        using var scope = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.CreateScope(_f.Services);
        var db = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<AppDbContext>(scope.ServiceProvider);
        var logs = db.AuditLogs.Where(l => l.Action == "report.exported").ToList();
        logs.Should().Contain(l => l.Details == "kind=Members;format=Pdf");
        string.Join("|", logs.Select(l => l.Details)).Should().NotContain("Auditada");
    }

    [Fact]
    public async Task Reports_AreRateLimited()
    {
        var email = "admin-ratelimit@rep.local";
        await TestUsers.Create(_low, email, UserRole.Administrador, ChurchSeedData.CathedralId);
        var c = await TestUsers.ClientFor(_low, email);
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 6; i++) codes.Add((await c.GetAsync("/api/reports/ministries?format=Xlsx")).StatusCode);
        codes.Take(3).Should().OnlyContain(s => s == HttpStatusCode.OK);
        codes.Skip(3).Should().OnlyContain(s => s == HttpStatusCode.TooManyRequests);
    }
}
