using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ChurchSeeker.Infrastructure.Persistence;

// Used only by `dotnet ef migrations`: always targets PostgreSQL (the SQLite path does not use migrations).
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("CHURCHSEEKER_DESIGN_CS") ?? "Host=localhost;Port=5433;Database=churchseeker;Username=churchseeker;Password=design-time-only";
        return new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(cs).Options);
    }
}
