using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChurchSeeker.UnitTests;

public class AnnouncementApiTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public AnnouncementApiTests(AuthApiFactory f) => _f = f;

    private static string D(int offsetDays) => DateTime.UtcNow.AddDays(offsetDays).ToString("yyyy-MM-dd");

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@ann.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static object Ann(string title, int publishOffset = 0, int? expiresOffset = null, bool important = false, bool isPublic = true, string body = "Texto del aviso") =>
        new { title, body, publishDate = D(publishOffset), expiresOn = expiresOffset is null ? null : D(expiresOffset.Value), isImportant = important, isPublic };

    private static async Task<Guid> Create(HttpClient c, object body) =>
        (await Json(await c.PostAsJsonAsync("/api/announcements", body))).GetProperty("id").GetGuid();

    private async Task<string> PublicText(Guid church, string path = "announcements") =>
        await (await _f.CreateClient().GetAsync($"/api/public/churches/{church}/{path}")).Content.ReadAsStringAsync();

    [Fact]
    public async Task Crud_And_SoftDelete()
    {
        var c = await As(UserRole.Pastor, ChurchSeedData.CathedralId, "crud");
        var id = await Create(c, Ann("Retiro"));
        var upd = await c.PutAsJsonAsync($"/api/announcements/{id}", Ann("Retiro anual", important: true));
        (await Json(upd)).GetProperty("title").GetString().Should().Be("Retiro anual");

        (await c.DeleteAsync($"/api/announcements/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await c.DeleteAsync($"/api/announcements/{id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Json(await c.GetAsync($"/api/announcements/{id}"))).GetProperty("isActive").GetBoolean().Should().BeFalse();
        (await Json(await c.GetAsync("/api/announcements"))).GetProperty("items").EnumerateArray()
            .Should().NotContain(a => a.GetProperty("id").GetGuid() == id);
        (await Json(await c.GetAsync("/api/announcements?includeInactive=true"))).GetProperty("items").EnumerateArray()
            .Should().Contain(a => a.GetProperty("id").GetGuid() == id);
    }

    [Theory]
    [InlineData("", "cuerpo")]
    [InlineData("titulo", "")]
    [InlineData("<script>alert(1)</script>", "cuerpo")]
    [InlineData("titulo", "<img src=x onerror=alert(1)>")]
    [InlineData("titulo", "<b>negritas</b>")]
    public async Task InvalidText_400(string title, string body)
    {
        var c = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "inv" + Guid.NewGuid().ToString("N")[..6]);
        (await c.PostAsJsonAsync("/api/announcements", Ann(title, body: body))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task InvalidDatesAndSizes_400()
    {
        var c = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "dates");
        (await c.PostAsJsonAsync("/api/announcements", Ann("x", publishOffset: 5, expiresOffset: 2))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/announcements", new { title = "x", body = "y", publishDate = "1990-01-01", isPublic = true })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/announcements", Ann("x", body: new string('b', 8001)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await c.PostAsJsonAsync("/api/announcements", Ann(new string('t', 201)))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PublicFeed_ShowsOnlyPublishedPublicActiveNotExpired_ImportantFirst()
    {
        var c = await As(UserRole.Secretario, ChurchSeedData.SantaLuciaId, "feed");
        await Create(c, Ann("VISIBLE-NORMAL", publishOffset: -3));
        await Create(c, Ann("VISIBLE-IMPORTANTE", publishOffset: -10, important: true));
        await Create(c, Ann("FUTURO", publishOffset: 5));
        await Create(c, Ann("EXPIRADO", publishOffset: -10, expiresOffset: -1));
        await Create(c, Ann("INTERNO", isPublic: false));
        var removed = await Create(c, Ann("BORRADO"));
        await c.DeleteAsync($"/api/announcements/{removed}");

        var text = await PublicText(ChurchSeedData.SantaLuciaId);
        text.Should().Contain("VISIBLE-NORMAL").And.Contain("VISIBLE-IMPORTANTE");
        foreach (var hidden in new[] { "FUTURO", "EXPIRADO", "INTERNO", "BORRADO" }) text.Should().NotContain(hidden);
        text.IndexOf("VISIBLE-IMPORTANTE").Should().BeLessThan(text.IndexOf("VISIBLE-NORMAL"));

        var important = await PublicText(ChurchSeedData.SantaLuciaId, "announcements?importantOnly=true");
        important.Should().Contain("VISIBLE-IMPORTANTE").And.NotContain("VISIBLE-NORMAL");
    }

    [Fact]
    public async Task Highlights_ReturnImportantNoticesAndNextPublicEvents()
    {
        var c = await As(UserRole.Secretario, ChurchSeedData.JesusId, "high");
        await Create(c, Ann("AVISO-CLAVE", important: true));
        await Create(c, Ann("AVISO-COMUN"));
        Task<HttpResponseMessage> Ev(string title, int offset, bool pub, bool cancel = false) =>
            c.PostAsJsonAsync("/api/events", new { title, date = D(offset), time = "10:00:00", location = "Nave", kind = 1, isPublic = pub });
        await Ev("EV-PROXIMO", 3, true);
        await Ev("EV-PRIVADO", 4, false);
        await Ev("EV-LEJANO", 200, true);
        var cancelled = (await Json(await Ev("EV-CANCELADO", 5, true))).GetProperty("id").GetGuid();
        await c.PostAsync($"/api/events/{cancelled}/cancel", null);

        var text = await PublicText(ChurchSeedData.JesusId, "highlights");
        text.Should().Contain("AVISO-CLAVE").And.Contain("EV-PROXIMO");
        foreach (var hidden in new[] { "AVISO-COMUN", "EV-PRIVADO", "EV-LEJANO", "EV-CANCELADO" }) text.Should().NotContain(hidden);
    }

    [Fact]
    public async Task OtherChurch_IsolatedInternalAndPublic()
    {
        var a = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "iso-a");
        var b = await As(UserRole.Secretario, ChurchSeedData.JesusId, "iso-b");
        var id = await Create(a, Ann("SOLO-CATEDRAL"));

        (await b.GetAsync($"/api/announcements/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.PutAsJsonAsync($"/api/announcements/{id}", Ann("hijack"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.DeleteAsync($"/api/announcements/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await PublicText(ChurchSeedData.JesusId)).Should().NotContain("SOLO-CATEDRAL");
        (await PublicText(ChurchSeedData.CathedralId)).Should().Contain("SOLO-CATEDRAL");
    }

    [Fact]
    public async Task Roles_ReadByStaff_WriteByManagement_PublicNeedsRealChurch()
    {
        var t = await As(UserRole.Tesorero, ChurchSeedData.CathedralId, "roles");
        (await t.GetAsync("/api/announcements")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await t.PostAsJsonAsync("/api/announcements", Ann("x"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await t.DeleteAsync($"/api/announcements/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _f.CreateClient().GetAsync("/api/announcements")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await _f.CreateClient().GetAsync($"/api/public/churches/{Guid.NewGuid()}/announcements")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await _f.CreateClient().GetAsync($"/api/public/churches/{Guid.NewGuid()}/highlights")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
