using System.Net;
using System.Net.Http.Json;
using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.UnitTests;

public class LowLimitFactory : AuthApiFactory
{
    protected override int AuthLimit => 3;
}

public class HardeningTests : IClassFixture<AuthApiFactory>, IClassFixture<LowLimitFactory>
{
    private readonly AuthApiFactory _factory;
    private readonly LowLimitFactory _limited;

    public HardeningTests(AuthApiFactory factory, LowLimitFactory limited)
    {
        _factory = factory;
        _limited = limited;
    }

    [Fact]
    public async Task Responses_CarrySecurityHeaders()
    {
        var res = await _factory.CreateClient().GetAsync("/api/auth/me");
        res.Headers.GetValues("X-Content-Type-Options").Should().Contain("nosniff");
        res.Headers.GetValues("X-Frame-Options").Should().Contain("DENY");
        res.Headers.GetValues("Referrer-Policy").Should().Contain("no-referrer");
        res.Headers.GetValues("Content-Security-Policy").Single().Should().Contain("frame-ancestors 'none'").And.Contain("default-src 'none'");
        res.Headers.GetValues("Cache-Control").Should().Contain("no-store");
    }

    [Fact]
    public async Task Cors_AllowsConfiguredOrigin_OnlyWithCredentials()
    {
        var c = _factory.CreateClient();
        HttpRequestMessage Preflight(string origin) => new(HttpMethod.Options, "/api/auth/login")
        {
            Headers = { { "Origin", origin }, { "Access-Control-Request-Method", "POST" }, { "Access-Control-Request-Headers", "content-type" } }
        };

        var ok = await c.SendAsync(Preflight("http://localhost:5173"));
        ok.Headers.GetValues("Access-Control-Allow-Origin").Should().Contain("http://localhost:5173");
        ok.Headers.GetValues("Access-Control-Allow-Credentials").Should().Contain("true");
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("null")]
    [InlineData("http://localhost:5173.evil.example")]
    public async Task Cors_RejectsOtherOrigins(string origin)
    {
        var req = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login")
        {
            Headers = { { "Origin", origin }, { "Access-Control-Request-Method", "POST" } }
        };
        var res = await _factory.CreateClient().SendAsync(req);
        res.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
    }

    [Fact]
    public async Task Login_IsRateLimited_Returns429WithRetryAfter()
    {
        var c = _limited.CreateClient();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 6; i++)
            codes.Add((await c.PostAsJsonAsync("/api/auth/login", new { email = "x@test.local", password = "bad" })).StatusCode);

        codes.Take(3).Should().OnlyContain(s => s == HttpStatusCode.Unauthorized);
        codes.Skip(3).Should().OnlyContain(s => s == HttpStatusCode.TooManyRequests);
        var last = await c.PostAsJsonAsync("/api/auth/login", new { email = "x@test.local", password = "bad" });
        last.Headers.Contains("Retry-After").Should().BeTrue();
    }

    [Fact]
    public async Task AuthEvents_AreAudited_WithoutLeakingEmailOrPassword()
    {
        var c = _factory.CreateClient();
        const string secretPw = "Sup3r!SecretPw#";
        await c.PostAsJsonAsync("/api/auth/login", new { email = AuthApiFactory.AdminEmail, password = secretPw });
        await c.PostAsJsonAsync("/api/auth/login", new { email = AuthApiFactory.AdminEmail, password = AuthApiFactory.AdminPassword });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rows = await db.AuditLogs.AsNoTracking().ToListAsync();
        rows.Select(r => r.Action).Should().Contain(["auth.login.failed", "auth.login.succeeded"]);
        var dump = string.Join("|", rows.Select(r => $"{r.Details}{r.EntityId}{r.Action}"));
        dump.Should().NotContain(secretPw).And.NotContain(AuthApiFactory.AdminEmail);
    }

    [Fact]
    public async Task AuditLog_CannotBeUpdatedOrDeleted()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.AuditLogs.Add(new AuditLog("test.event", null, null));
        await db.SaveChangesAsync();

        var row = await db.AuditLogs.FirstAsync(a => a.Action == "test.event");
        db.Entry(row).Property(x => x.Details).CurrentValue = "tampered";
        db.Entry(row).State = EntityState.Modified;
        await FluentActions.Awaiting(() => db.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        db.ChangeTracker.Clear();

        var row2 = await db.AuditLogs.FirstAsync(a => a.Action == "test.event");
        db.AuditLogs.Remove(row2);
        await FluentActions.Awaiting(() => db.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
    }

    private sealed class Pledge : TenantEntity, IAuditedEntity
    {
        private Pledge() { }
        public Pledge(Guid churchId, decimal amount) : base(churchId) => Amount = amount;
        public decimal Amount { get; set; }
    }

    private sealed class AuditedDb : AppDbContext
    {
        public AuditedDb(DbContextOptions<AppDbContext> o, ICurrentUser u) : base(o, u) { }
        public DbSet<Pledge> Pledges => Set<Pledge>();

        protected override void OnModelCreating(ModelBuilder b)
        {
            base.OnModelCreating(b);
            b.Entity<Pledge>().HasKey(x => x.Id);
            ApplyTenantFilters(b);
        }
    }

    private sealed record Who(Guid? ChurchId) : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public Guid? UserId => Guid.Parse("99999999-9999-9999-9999-999999999999");
        public Domain.Enums.UserRole? Role => Domain.Enums.UserRole.Tesorero;
        public string? IpAddress => "10.0.0.1";
    }

    [Fact]
    public void AuditedEntity_ChangesAreLogged_NamesOnly_NoAmounts()
    {
        using var conn = new SqliteConnection("DataSource=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        using var db = new AuditedDb(opts, new Who(ChurchSeedData.CathedralId));
        db.Database.EnsureCreated();

        var d = new Pledge(ChurchSeedData.CathedralId, 123456.78m);
        db.Pledges.Add(d);
        db.SaveChanges();
        d.Amount = 999111.22m;
        db.SaveChanges();

        var logs = db.AuditLogs.AsNoTracking().OrderBy(a => a.CreatedAt).ToList();
        logs.Select(l => l.Action).Should().Equal("Pledge.Created", "Pledge.Updated");
        logs[1].Details.Should().Be("Amount");
        logs.Should().OnlyContain(l => l.ChurchId == ChurchSeedData.CathedralId && l.IpAddress == "10.0.0.1");
        string.Join("|", logs.Select(l => l.Details)).Should().NotContain("123456").And.NotContain("999111");
    }
}

