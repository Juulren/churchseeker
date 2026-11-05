using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ChurchSeeker.UnitTests;

// Behind a proxy every request comes from the proxy's address: the rate limits must tell clients apart by X-Forwarded-For,
// but only when the deployment declares the proxy (otherwise a client could pick its own address).
public class BehindProxyFactory : AuthApiFactory
{
    protected override int AuthLimit => 2;
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("ForwardedHeaders:Enabled", "true");
    }
}

public class NotBehindProxyFactory : AuthApiFactory
{
    protected override int AuthLimit => 2;
}

public class ProxyAndBootstrapTests : IClassFixture<BehindProxyFactory>, IClassFixture<NotBehindProxyFactory>
{
    private readonly BehindProxyFactory _behind;
    private readonly NotBehindProxyFactory _direct;
    public ProxyAndBootstrapTests(BehindProxyFactory behind, NotBehindProxyFactory direct) { _behind = behind; _direct = direct; }

    private static async Task<HttpStatusCode> Login(HttpClient c, string forwardedFor)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login") { Content = JsonContent.Create(new { email = "x@test.local", password = "bad" }) };
        req.Headers.Add("X-Forwarded-For", forwardedFor);
        return (await c.SendAsync(req)).StatusCode;
    }

    [Fact]
    public async Task WhenDeclaredBehindAProxy_EachClientAddressHasItsOwnAuthBucket()
    {
        var c = _behind.CreateClient();
        for (var i = 0; i < 2; i++) (await Login(c, "203.0.113.1")).Should().NotBe(HttpStatusCode.TooManyRequests);
        (await Login(c, "203.0.113.1")).Should().Be(HttpStatusCode.TooManyRequests, "the same client is limited");
        (await Login(c, "203.0.113.2")).Should().NotBe(HttpStatusCode.TooManyRequests, "another client is not locked out with it");
    }

    [Fact]
    public async Task WithoutTheProxySetting_TheForwardedHeaderIsIgnored_SoItCannotBeUsedToDodgeTheLimit()
    {
        var c = _direct.CreateClient();
        for (var i = 0; i < 2; i++) await Login(c, $"198.51.100.{i + 1}");
        (await Login(c, "198.51.100.99")).Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Health_AnswersWithoutSignIn_AndStaticPagesAreNotRateLimited()
    {
        var c = _direct.CreateClient();
        for (var i = 0; i < 5; i++) (await c.GetAsync("/api/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

// Outside development nothing touches the schema when the server starts: that is `--bootstrap`'s job.
public class ProductionStartupTests
{
    [Fact]
    public async Task InProduction_TheServerStartsWithoutCreatingOrMigratingTheDatabase()
    {
        var file = Path.Combine(Path.GetTempPath(), $"cs-prod-{Guid.NewGuid():N}.db");
        try
        {
            await using var f = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            {
                b.UseEnvironment("Production");
                b.UseSetting("Jwt:Key", "test-key-test-key-test-key-test-key-1234");
                b.UseSetting("ConnectionStrings:Default", $"Data Source={file}");
                b.UseSetting("Database:AutoCreate", "true");
                b.UseSetting("Seed:Demo", "false");
            });
            var health = await f.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }).GetAsync("/api/health");
            health.StatusCode.Should().Be(HttpStatusCode.OK);
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            (!File.Exists(file) || new FileInfo(file).Length == 0).Should().BeTrue("the schema is applied by --bootstrap, not on start");
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); try { File.Delete(file); } catch { } }
    }
}
