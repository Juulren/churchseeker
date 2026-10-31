using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChurchSeeker.UnitTests;

public static class TestFiles
{
    public static byte[] Pdf(string extra = "") =>
        Encoding.Latin1.GetBytes($"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R {extra} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

    public static byte[] Png() =>
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4];

    public static byte[] Glb(int extra = 12)
    {
        var total = 12 + extra;
        var data = new byte[total];
        Encoding.ASCII.GetBytes("glTF").CopyTo(data, 0);
        BitConverter.GetBytes(2u).CopyTo(data, 4);
        BitConverter.GetBytes((uint)total).CopyTo(data, 8);
        return data;
    }

    public static MultipartFormDataContent Form(byte[] file, string fileName, IDictionary<string, string>? fields = null, string field = "file")
    {
        var form = new MultipartFormDataContent();
        var part = new ByteArrayContent(file);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(part, field, fileName);
        foreach (var (k, v) in fields ?? new Dictionary<string, string>()) form.Add(new StringContent(v), k);
        return form;
    }
}

public class ChurchAndBookApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public ChurchAndBookApiTests(AuthApiFactory f) => _f = f;

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@cb.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static Dictionary<string, string> Meta(string title = "Libro de bautismos", bool isPublic = true, string color = "#5b3a29", string thickness = "6") =>
        new() { ["title"] = title, ["isPublic"] = isPublic.ToString().ToLower(), ["spineColor"] = color, ["spineThickness"] = thickness, ["author"] = "Parroquia" };

    private static object Profile(string name = "Catedral Renovada", string? phone = "999 928 1000", string? email = "info@catedral.mx",
                                  double lat = 20.9674, double lng = -89.6237, object[]? schedules = null) =>
        new { name, denomination = "Católica", patronSaint = "San Ildefonso", address = "Calle 60, Centro", contactPhone = phone,
              contactEmail = email, latitude = lat, longitude = lng,
              schedules = schedules ?? [new { day = 0, time = "09:00:00", description = "Misa dominical" }, new { day = 6, time = "18:00:00", description = "Misa vespertina" }] };

    private int FilesIn(string kind)
    {
        var dir = Path.Combine(_f.StorageRoot, kind);
        return Directory.Exists(dir) ? Directory.GetFiles(dir).Length : 0;
    }

    // ---- Church profile ------------------------------------------------------------------------

    [Fact]
    public async Task Admin_UpdatesProfile_SchedulesAreSortedAndPublic()
    {
        var admin = await As(UserRole.Administrador, ChurchSeedData.JesusId, "prof");
        var res = await admin.PutAsJsonAsync("/api/church", Profile("Jesús Renovada"));
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(res);
        body.GetProperty("name").GetString().Should().Be("Jesús Renovada");
        body.GetProperty("schedules")[0].GetProperty("day").GetInt32().Should().Be(6, "Saturday sorts before Sunday in a Mon-first week");
        body.GetProperty("schedules").GetArrayLength().Should().Be(2);

        var pub = await Json(await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.JesusId}"));
        pub.GetProperty("contactEmail").GetString().Should().Be("info@catedral.mx");
        pub.GetProperty("schedules").GetArrayLength().Should().Be(2);
    }

    [Fact]
    public async Task Profile_Invalid_400()
    {
        var admin = await As(UserRole.Administrador, ChurchSeedData.SantaLuciaId, "badprof");
        (await admin.PutAsJsonAsync("/api/church", Profile(name: "<script>x</script>"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(name: ""))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(phone: "call me"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(email: "nope"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(lat: 91))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(lng: -181))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var many = Enumerable.Range(0, 31).Select(i => (object)new { day = 1, time = "08:00:00", description = $"s{i}" }).ToArray();
        (await admin.PutAsJsonAsync("/api/church", Profile(schedules: many))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(schedules: [new { day = 99, time = "08:00:00", description = "x" }]))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/church", Profile(schedules: [new { day = 1, time = "08:00:00", description = "<b>x</b>" }]))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task OnlyAdmin_CanChangeSettings_StaffCanRead()
    {
        foreach (var role in new[] { UserRole.Pastor, UserRole.Secretario, UserRole.Tesorero, UserRole.Coordinador })
        {
            var c = await As(role, ChurchSeedData.CathedralId, "cfg");
            (await c.GetAsync("/api/church")).StatusCode.Should().Be(HttpStatusCode.OK);
            (await c.PutAsJsonAsync("/api/church", Profile())).StatusCode.Should().Be(HttpStatusCode.Forbidden);
            (await c.PostAsync("/api/church/logo", TestFiles.Form(TestFiles.Png(), "l.png"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
            (await c.PostAsync("/api/church/model", TestFiles.Form(TestFiles.Glb(), "m.glb"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        (await _f.CreateClient().GetAsync("/api/church")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Admin_CannotTouchAnotherChurch_ProfileIsAlwaysOwn()
    {
        var a = await As(UserRole.Administrador, ChurchSeedData.CathedralId, "own-a");
        var before = await Json(await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.JesusId}"));
        await a.PutAsJsonAsync("/api/church", Profile("Solo Catedral"));
        var after = await Json(await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.JesusId}"));
        after.GetProperty("name").GetString().Should().Be(before.GetProperty("name").GetString());
        (await Json(await a.GetAsync("/api/church"))).GetProperty("id").GetGuid().Should().Be(ChurchSeedData.CathedralId);
    }

    [Fact]
    public async Task Logo_AcceptsRealImages_RejectsEverythingElse_ServedSafely()
    {
        var admin = await As(UserRole.Administrador, ChurchSeedData.SantaLuciaId, "logo");
        (await admin.PostAsync("/api/church/logo", TestFiles.Form(TestFiles.Png(), "../../logo.png"))).StatusCode.Should().Be(HttpStatusCode.OK);

        var pub = await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/logo");
        pub.StatusCode.Should().Be(HttpStatusCode.OK);
        pub.Content.Headers.ContentType!.MediaType.Should().Be("image/png");
        pub.Headers.GetValues("X-Content-Type-Options").Should().Contain("nosniff");

        var svg = Encoding.UTF8.GetBytes("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
        foreach (var (name, bytes) in new (string, byte[])[] { ("x.svg", svg), ("x.png", Encoding.ASCII.GetBytes("GIF89a....")), ("x.png", TestFiles.Pdf()),
                                                                ("x.png", Encoding.ASCII.GetBytes("<html>")), ("x.png", new byte[] { 0x4D, 0x5A, 0x90, 0 }) })
            (await admin.PostAsync("/api/church/logo", TestFiles.Form(bytes, name))).StatusCode.Should().Be(HttpStatusCode.BadRequest, name);

        var big = new byte[3 * 1024 * 1024];
        TestFiles.Png().CopyTo(big, 0);
        ((int)(await admin.PostAsync("/api/church/logo", TestFiles.Form(big, "big.png"))).StatusCode).Should().BeInRange(400, 413);
        (await admin.PostAsync("/api/church/logo", TestFiles.Form([], "empty.png"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PostAsync("/api/church/logo", TestFiles.Form(TestFiles.Png(), "x.png", field: "wrong"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Model_ValidatesGlbHeader()
    {
        var admin = await As(UserRole.Administrador, ChurchSeedData.JesusId, "model");
        (await admin.PostAsync("/api/church/model", TestFiles.Form(TestFiles.Glb(), "m.glb"))).StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await Json(await _f.CreateClient().GetAsync("/api/public/churches"));
        var jesus = list.EnumerateArray().Single(c => c.GetProperty("id").GetGuid() == ChurchSeedData.JesusId);
        jesus.GetProperty("modelUrl").GetString().Should().Be($"/api/public/churches/{ChurchSeedData.JesusId}/model");
        (await _f.CreateClient().GetAsync(jesus.GetProperty("modelUrl").GetString()!)).Content.Headers.ContentType!.MediaType.Should().Be("model/gltf-binary");

        var wrongLength = TestFiles.Glb(); BitConverter.GetBytes(9999u).CopyTo(wrongLength, 8);
        var wrongVersion = TestFiles.Glb(); BitConverter.GetBytes(1u).CopyTo(wrongVersion, 4);
        foreach (var bad in new[] { wrongLength, wrongVersion, Encoding.ASCII.GetBytes("not a model at all, sorry...."), TestFiles.Png() })
            (await admin.PostAsync("/api/church/model", TestFiles.Form(bad, "m.glb"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PublicList_HasThreePilotChurches_UnknownIs404()
    {
        var list = await Json(await _f.CreateClient().GetAsync("/api/public/churches"));
        list.GetArrayLength().Should().BeGreaterOrEqualTo(3);
        list.EnumerateArray().Should().OnlyContain(c => c.GetProperty("latitude").GetDouble() > 20 && c.GetProperty("latitude").GetDouble() < 21.1);
        (await _f.CreateClient().GetAsync($"/api/public/churches/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await _f.CreateClient().GetAsync($"/api/public/churches/{Guid.NewGuid()}/logo")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ---- Codex shelf ------------------------------------------------------------------------------

    private static async Task<Guid> Upload(HttpClient c, Dictionary<string, string> meta, byte[]? pdf = null, string name = "libro.pdf") =>
        (await Json(await c.PostAsync("/api/books", TestFiles.Form(pdf ?? TestFiles.Pdf(), name, meta)))).GetProperty("id").GetGuid();

    [Fact]
    public async Task Upload_Read_PublicAndPrivateVisibility()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "book");
        var pub = await Upload(sec, Meta("PUBLICO-1", true));
        var priv = await Upload(sec, Meta("PRIVADO-1", false, "#112233", "9"));

        var anon = _f.CreateClient();
        var shelf = await anon.GetStringAsync($"/api/public/churches/{ChurchSeedData.CathedralId}/books");
        shelf.Should().Contain("PUBLICO-1").And.NotContain("PRIVADO-1").And.NotContain("storedFileName").And.NotContain(".pdf");

        var file = await anon.GetAsync($"/api/public/churches/{ChurchSeedData.CathedralId}/books/{pub}/file");
        file.StatusCode.Should().Be(HttpStatusCode.OK);
        file.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
        (await file.Content.ReadAsByteArrayAsync()).Take(5).Should().Equal("%PDF-"u8.ToArray());

        // Private: not found (never 403/200), with or without a session of another church.
        (await anon.GetAsync($"/api/public/churches/{ChurchSeedData.CathedralId}/books/{priv}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var otherChurch = await As(UserRole.Secretario, ChurchSeedData.JesusId, "book-x");
        (await otherChurch.GetAsync($"/api/public/churches/{ChurchSeedData.CathedralId}/books/{priv}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await otherChurch.GetAsync($"/api/books/{priv}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        // Staff of the owning church read both, whatever their role.
        var treasurer = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "book-t");
        (await treasurer.GetAsync($"/api/books/{priv}/file")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(await treasurer.GetAsync("/api/books"))).GetProperty("total").GetInt32().Should().BeGreaterOrEqualTo(2);
    }

    [Fact]
    public async Task Upload_RejectsFakeAndDangerousPdfs()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "evil");
        var before = FilesIn("book");
        var cases = new (string Why, byte[] Bytes, string Name)[]
        {
            ("exe", new byte[] { 0x4D, 0x5A, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xFF, 0xFF, 0, 0, 0xB8 }, "libro_sagrado.pdf"),
            ("shell script", Encoding.ASCII.GetBytes("#!/bin/sh\nrm -rf /\n"), "libro.pdf"),
            ("html", Encoding.ASCII.GetBytes("<html><script>alert(1)</script></html>"), "libro.pdf"),
            ("leading junk", Encoding.ASCII.GetBytes(" \n%PDF-1.4\n%%EOF\n"), "libro.pdf"),
            ("truncated", Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"), "libro.pdf"),
            ("version 9", Encoding.ASCII.GetBytes("%PDF-9.9\n%%EOF\n          "), "libro.pdf"),
            ("javascript", TestFiles.Pdf("/JS (app.alert(1))"), "libro.pdf"),
            ("javascript name", TestFiles.Pdf("/S /JavaScript"), "libro.pdf"),
            ("obfuscated javascript", TestFiles.Pdf("/S /J#61vaScr#69pt"), "libro.pdf"),
            ("open action", TestFiles.Pdf("/OpenAction 3 0 R"), "libro.pdf"),
            ("launch", TestFiles.Pdf("/Launch /Win << /F (cmd.exe) >>"), "libro.pdf"),
            ("embedded file", TestFiles.Pdf("/EmbeddedFile"), "libro.pdf"),
            ("png as pdf", TestFiles.Png(), "libro.pdf"),
            ("empty", [], "libro.pdf"),
        };
        foreach (var (why, bytes, name) in cases)
            (await sec.PostAsync("/api/books", TestFiles.Form(bytes, name, Meta()))).StatusCode.Should().Be(HttpStatusCode.BadRequest, why);
        FilesIn("book").Should().Be(before, "rejected uploads must not leave files behind");
    }

    [Fact]
    public async Task Upload_Oversized_Rejected()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "huge");
        var huge = new byte[26 * 1024 * 1024];
        Encoding.ASCII.GetBytes("%PDF-1.4\n").CopyTo(huge, 0);
        Encoding.ASCII.GetBytes("\n%%EOF\n").CopyTo(huge, huge.Length - 8);
        ((int)(await sec.PostAsync("/api/books", TestFiles.Form(huge, "enorme.pdf", Meta()))).StatusCode).Should().BeInRange(400, 413);
    }

    [Fact]
    public async Task Upload_BadMetadata_400_AndNoOrphanFile()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.JesusId, "meta");
        var before = FilesIn("book");
        foreach (var meta in new[]
        {
            Meta(color: "red"), Meta(color: "#12345"), Meta(color: "#GGGGGG"), Meta(thickness: "0"), Meta(thickness: "11"),
            Meta(title: "<script>alert(1)</script>"), Meta(title: ""), Meta(title: new string('t', 201))
        })
            ((int)(await sec.PostAsync("/api/books", TestFiles.Form(TestFiles.Pdf(), "ok.pdf", meta))).StatusCode).Should().BeInRange(400, 499);
        FilesIn("book").Should().Be(before);
        (await sec.PostAsync("/api/books", TestFiles.Form(TestFiles.Pdf(), "ok.pdf", Meta(title: "")))
            ).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task StoredName_IsRandomGuid_NeverTheClientName()
    {
        var sec = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "names");
        await Upload(sec, Meta("Traversal"), name: "../../../etc/passwd.pdf");
        await Upload(sec, Meta("Traversal 2"), name: "..\\..\\windows\\evil.pdf");
        var names = Directory.GetFiles(Path.Combine(_f.StorageRoot, "book")).Select(Path.GetFileName).ToList();
        names.Should().OnlyContain(n => System.Text.RegularExpressions.Regex.IsMatch(n!, "^[0-9a-f]{32}\\.pdf$"));
        Directory.GetFiles(_f.StorageRoot, "*", SearchOption.AllDirectories).Should().OnlyContain(p => p.StartsWith(_f.StorageRoot));
        Path.GetDirectoryName(_f.StorageRoot)!.Should().NotBeNull();
        File.Exists(Path.Combine(Path.GetTempPath(), "etc", "passwd.pdf")).Should().BeFalse();
    }

    [Fact]
    public async Task Metadata_UpdateAndDeactivate_HideFromPublicShelf()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "life");
        var id = await Upload(sec, Meta("CICLO-VIDA", true));
        var anon = _f.CreateClient();
        (await anon.GetStringAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/books")).Should().Contain("CICLO-VIDA");

        var upd = await sec.PutAsJsonAsync($"/api/books/{id}", new { title = "CICLO-VIDA", isPublic = false, spineColor = "#000000", spineThickness = 3 });
        upd.StatusCode.Should().Be(HttpStatusCode.OK);
        (await anon.GetStringAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/books")).Should().NotContain("CICLO-VIDA");
        (await anon.GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/books/{id}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        await sec.PutAsJsonAsync($"/api/books/{id}", new { title = "CICLO-VIDA", isPublic = true, spineColor = "#000000", spineThickness = 3 });
        (await sec.DeleteAsync($"/api/books/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await anon.GetStringAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/books")).Should().NotContain("CICLO-VIDA");
        (await anon.GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/books/{id}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await sec.GetAsync($"/api/books/{id}/file")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Books_RolesAndIsolation()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "iso-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "iso-b");
        var id = await Upload(a, Meta("SOLO-A", false));
        (await b.GetAsync($"/api/books/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PutAsJsonAsync($"/api/books/{id}", new { title = "hijack", isPublic = true, spineColor = "#000000", spineThickness = 3 })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.DeleteAsync($"/api/books/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        foreach (var role in new[] { UserRole.Tesorero, UserRole.Coordinador })
        {
            var c = await As(role, ChurchSeedData.CathedralId, "deny");
            (await c.PostAsync("/api/books", TestFiles.Form(TestFiles.Pdf(), "x.pdf", Meta()))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
            (await c.DeleteAsync($"/api/books/{id}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        (await _f.CreateClient().GetAsync("/api/books")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await _f.CreateClient().GetAsync($"/api/books/{id}/file")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await _f.CreateClient().GetAsync($"/api/public/churches/{Guid.NewGuid()}/books")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
