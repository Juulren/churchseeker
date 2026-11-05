using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

// The same API with the files kept in the database (the setup for Vercel + Neon, where no disk survives).
public class DatabaseStorageFactory : AuthApiFactory
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Storage:Provider", "Database");
    }

    public async Task<int> CountAsync<T>(Func<AppDbContext, IQueryable<T>> set)
    {
        using var scope = Services.CreateScope();
        return await set(scope.ServiceProvider.GetRequiredService<AppDbContext>()).CountAsync();
    }
}

public class DatabaseStorageTests : IClassFixture<DatabaseStorageFactory>
{
    private readonly DatabaseStorageFactory _f;
    public DatabaseStorageTests(DatabaseStorageFactory f) => _f = f;

    private async Task<HttpClient> Secretary(string tag)
    {
        var email = $"sec-{tag}@db.local";
        await TestUsers.Create(_f, email, UserRole.Secretario, ChurchSeedData.SantaLuciaId);
        return await TestUsers.ClientFor(_f, email);
    }

    private static Dictionary<string, string> Meta(string title = "Libro en base") =>
        new() { ["title"] = title, ["isPublic"] = "true", ["spineColor"] = "#5b3a29", ["spineThickness"] = "6" };

    // A valid PDF padded with a comment so it reaches the wanted size.
    private static byte[] PdfOf(int size)
    {
        var head = TestFiles.Pdf();
        var all = new byte[size];
        Array.Fill(all, (byte)' ');
        Array.Copy(head, all, head.Length - 8);
        Array.Copy(head, head.Length - 8, all, size - 8, 8); // the trailer with %%EOF stays at the very end
        return all;
    }

    [Fact]
    public async Task ABook_IsStoredInTheDatabase_AndReadBackByteForByte_WithNothingOnDisk()
    {
        var sec = await Secretary("roundtrip");
        var pdf = TestFiles.Pdf("/Round 1");
        var created = await sec.PostAsync("/api/books", TestFiles.Form(pdf, "a.pdf", Meta()));
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var id = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        (await _f.CountAsync(db => db.StoredFiles)).Should().BeGreaterThan(0);
        Directory.Exists(_f.StorageRoot).Should().BeFalse("with the database provider nothing is written to the disk");

        var file = await sec.GetAsync($"/api/books/{id}/file");
        file.StatusCode.Should().Be(HttpStatusCode.OK);
        (await file.Content.ReadAsByteArrayAsync()).Should().Equal(pdf);

        var pub = await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/books/{id}/file");
        pub.StatusCode.Should().Be(HttpStatusCode.OK);
        pub.Headers.CacheControl!.Public.Should().BeTrue();
    }

    [Fact]
    public async Task APdfOfExactly4MiB_IsAccepted_AndOneByteMoreIsRejected()
    {
        var sec = await Secretary("limit");
        const int Max = 4 * 1024 * 1024;
        (await sec.PostAsync("/api/books", TestFiles.Form(PdfOf(Max), "justfits.pdf", Meta("Justo")))).StatusCode.Should().Be(HttpStatusCode.Created);
        var over = await sec.PostAsync("/api/books", TestFiles.Form(PdfOf(Max + 1), "toobig.pdf", Meta("Grande")));
        ((int)over.StatusCode).Should().BeInRange(400, 413);
    }

    [Fact]
    public async Task ABookWithInvalidMetadata_LeavesNoFileBehind()
    {
        var sec = await Secretary("orphan");
        var before = await _f.CountAsync(db => db.StoredFiles);
        (await sec.PostAsync("/api/books", TestFiles.Form(TestFiles.Pdf(), "x.pdf", Meta("")))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await _f.CountAsync(db => db.StoredFiles)).Should().Be(before);
    }

    [Fact]
    public async Task ReplacingALogo_RemovesTheOldOne_AndItIsServedWithACacheHeader()
    {
        await TestUsers.Create(_f, "admin-logo@db.local", UserRole.Administrador, ChurchSeedData.SantaLuciaId);
        var admin = await TestUsers.ClientFor(_f, "admin-logo@db.local");
        (await admin.PostAsync("/api/church/logo", TestFiles.Form(TestFiles.Png(), "one.png"))).StatusCode.Should().Be(HttpStatusCode.OK);
        var afterFirst = await _f.CountAsync(db => db.StoredFiles.Where(f => f.Kind == ChurchSeeker.Application.Storage.FileKind.Logo));
        (await admin.PostAsync("/api/church/logo", TestFiles.Form(TestFiles.Png(), "two.png"))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _f.CountAsync(db => db.StoredFiles.Where(f => f.Kind == ChurchSeeker.Application.Storage.FileKind.Logo))).Should().Be(afterFirst);

        var logo = await _f.CreateClient().GetAsync($"/api/public/churches/{ChurchSeedData.SantaLuciaId}/logo");
        logo.StatusCode.Should().Be(HttpStatusCode.OK);
        logo.Headers.CacheControl!.Public.Should().BeTrue();
    }

    [Fact]
    public async Task TheKeysThatProtectResetTokens_AreKeptInTheDatabase()
    {
        // Touch the protector so a key is created, then look for it in the table that every instance shares.
        using (var scope = _f.Services.CreateScope())
            scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>()
                .CreateProtector("test").Protect("x");
        (await _f.CountAsync(db => db.DataProtectionKeys)).Should().BeGreaterThan(0);
    }
}
