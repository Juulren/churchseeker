using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Exceptions;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.UnitTests;

public class DomainTests
{
    [Fact]
    public void Seed_HasThreePilotChurches_InsideMerida()
    {
        var churches = ChurchSeedData.Churches();
        churches.Should().HaveCount(3);
        churches.Should().OnlyContain(c => Math.Abs(c.Latitude - 20.9674) < 0.02 && Math.Abs(c.Longitude + 89.6237) < 0.02);
    }

    [Theory]
    [InlineData(double.NaN, 0)]
    [InlineData(91, 0)]
    [InlineData(0, -181)]
    [InlineData(0, double.NaN)]
    public void Church_RejectsInvalidCoordinates(double lat, double lng)
    {
        var act = () => new Church(Guid.NewGuid(), "A", "B", "C", "D", lat, lng);
        act.Should().Throw<DomainException>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Church_RejectsBlankName(string? name)
    {
        var act = () => new Church(Guid.NewGuid(), name!, "B", "C", "D", 20, -89);
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Church_RejectsOverlongName()
    {
        var act = () => new Church(Guid.NewGuid(), new string('x', 201), "B", "C", "D", 20, -89);
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Deactivate_IsSoftDelete()
    {
        var c = ChurchSeedData.Churches()[0];
        c.Deactivate();
        c.IsActive.Should().BeFalse();
        c.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public void Db_SeedsChurches()
    {
        using var conn = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        using var db = new AppDbContext(opts);
        db.Database.EnsureCreated();
        db.Churches.Count().Should().Be(3);
    }
}
