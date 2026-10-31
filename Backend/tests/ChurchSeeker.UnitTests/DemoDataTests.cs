using System.Net;
using System.Text.Json;
using ChurchSeeker.Infrastructure.Persistence;
using ChurchSeeker.Infrastructure.Storage;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;

namespace ChurchSeeker.UnitTests;

public class DemoFactory : AuthApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Seed:Demo", "true");
    }
}

public class DemoDataTests : IClassFixture<DemoFactory>
{
    private readonly DemoFactory _f;

    public DemoDataTests(DemoFactory f) => _f = f;

    [Theory]
    [InlineData("11111111-1111-1111-1111-111111111111")]
    [InlineData("22222222-2222-2222-2222-222222222222")]
    [InlineData("33333333-3333-3333-3333-333333333333")]
    public async Task EachChurch_GetsPublicEventsNewsAndOnlyPublicBooks(string churchId)
    {
        var c = _f.CreateClient();
        var events = JsonDocument.Parse(await c.GetStringAsync($"/api/public/churches/{churchId}/events")).RootElement;
        events.GetArrayLength().Should().Be(3, "the internal council meeting must stay private");

        var highlights = await c.GetStringAsync($"/api/public/churches/{churchId}/highlights");
        highlights.Should().Contain("importantAnnouncements");

        var books = JsonDocument.Parse(await c.GetStringAsync($"/api/public/churches/{churchId}/books")).RootElement;
        books.GetArrayLength().Should().Be(2);
        foreach (var book in books.EnumerateArray())
        {
            var res = await c.GetAsync($"/api/public/churches/{churchId}/books/{book.GetProperty("id").GetGuid()}/file");
            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var bytes = await res.Content.ReadAsByteArrayAsync();
            FileValidator.ValidatePdf(bytes).Ok.Should().BeTrue("the generated demo PDF must pass the same validation as uploads");
        }
    }

    [Fact]
    public async Task Seeding_IsIdempotent()
    {
        await DatabaseInitializer.InitializeAsync(_f.Services, new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Seed:Demo"] = "true", ["Database:AutoCreate"] = "true" }).Build());
        var events = JsonDocument.Parse(await _f.CreateClient().GetStringAsync("/api/public/churches/11111111-1111-1111-1111-111111111111/events")).RootElement;
        events.GetArrayLength().Should().Be(3);
    }
}
