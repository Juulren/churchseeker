using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Church> Churches => Set<Church>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Church>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
            e.Property(x => x.Denomination).IsRequired().HasMaxLength(100);
            e.Property(x => x.PatronSaint).IsRequired().HasMaxLength(150);
            e.Property(x => x.Address).IsRequired().HasMaxLength(300);
            e.Property(x => x.ModelPath).HasMaxLength(300);
            e.HasData(ChurchSeedData.Churches());
        });
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampUpdates();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        StampUpdates();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }

    private void StampUpdates()
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>().Where(e => e.State == EntityState.Modified))
            entry.Entity.Touch();
    }
}
