using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.UnitTests;

public class TenantFilterTests
{
    private sealed class Note : TenantEntity
    {
        private Note() { }
        public Note(Guid churchId) : base(churchId) { }
    }

    private sealed class TestDb : AppDbContext
    {
        public TestDb(DbContextOptions<AppDbContext> o, ICurrentUser? u) : base(o, u) { }
        public DbSet<Note> Notes => Set<Note>();

        protected override void OnModelCreating(ModelBuilder b)
        {
            base.OnModelCreating(b);
            b.Entity<Note>().HasKey(x => x.Id);
            ApplyTenantFilters(b);
        }
    }

    private sealed record FakeUser(Guid? ChurchId) : ICurrentUser
    {
        public bool IsAuthenticated => ChurchId.HasValue;
        public Guid? UserId => null;
        public UserRole? Role => null;
        public string? IpAddress => null;
    }

    [Fact]
    public void Queries_OnlySeeOwnChurch_AndNothingWhenAnonymous()
    {
        using var conn = new SqliteConnection("DataSource=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;

        using (var seed = new TestDb(opts, new FakeUser(ChurchSeedData.CathedralId)))
        {
            seed.Database.EnsureCreated();
            seed.Notes.AddRange(new Note(ChurchSeedData.CathedralId), new Note(ChurchSeedData.JesusId), new Note(ChurchSeedData.JesusId));
            seed.SaveChanges();
        }

        using var a = new TestDb(opts, new FakeUser(ChurchSeedData.CathedralId));
        a.Notes.Count().Should().Be(1);
        using var j = new TestDb(opts, new FakeUser(ChurchSeedData.JesusId));
        j.Notes.Count().Should().Be(2);
        using var anon = new TestDb(opts, new FakeUser(null));
        anon.Notes.Count().Should().Be(0);
        using var none = new TestDb(opts, null);
        none.Notes.Count().Should().Be(0);
    }
}

