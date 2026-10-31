using System.Reflection;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    private readonly ICurrentUser? _currentUser;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser? currentUser = null) : base(options)
    {
        _currentUser = currentUser;
    }

    public DbSet<Church> Churches => Set<Church>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    // Fail closed: no authenticated church means the tenant filter matches nothing.
    private Guid? CurrentChurchId => _currentUser?.ChurchId;

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

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

        b.Entity<ApplicationUser>(e =>
        {
            e.Property(x => x.FullName).IsRequired().HasMaxLength(200);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<RefreshToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.TokenHash).IsRequired().HasMaxLength(128);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.UserId);
        });

        ApplyTenantFilters(b);
    }

    // Idempotent: subclasses that add tenant entities call it again after registering them.
    protected void ApplyTenantFilters(ModelBuilder b)
    {
        var method = typeof(AppDbContext).GetMethod(nameof(SetTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;
        foreach (var type in b.Model.GetEntityTypes()
                     .Where(t => t.BaseType is null && typeof(TenantEntity).IsAssignableFrom(t.ClrType))
                     .Select(t => t.ClrType).ToList())
            method.MakeGenericMethod(type).Invoke(this, [b]);
    }

    private void SetTenantFilter<T>(ModelBuilder b) where T : TenantEntity =>
        b.Entity<T>().HasQueryFilter(e => e.ChurchId == CurrentChurchId);

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
