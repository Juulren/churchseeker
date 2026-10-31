using System.Reflection;
using System.Text.Json;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace ChurchSeeker.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    private readonly ICurrentUser? _currentUser;
    private readonly PublicTenantScope? _publicScope;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser? currentUser = null,
                      PublicTenantScope? publicScope = null) : base(options)
    {
        _currentUser = currentUser;
        _publicScope = publicScope;
    }

    public DbSet<Church> Churches => Set<Church>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<ChurchEvent> Events => Set<ChurchEvent>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<Ministry> Ministries => Set<Ministry>();
    public DbSet<MinistryMember> MinistryMembers => Set<MinistryMember>();
    public DbSet<Donation> Donations => Set<Donation>();
    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<ChurchArchiveBook> ArchiveBooks => Set<ChurchArchiveBook>();

    // Fail closed: no authenticated church means the tenant filter matches nothing.
    private Guid? CurrentChurchId => _publicScope?.ChurchId ?? _currentUser?.ChurchId;

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
            e.Property(x => x.ContactPhone).HasMaxLength(30);
            e.Property(x => x.ContactEmail).HasMaxLength(256);
            e.Property(x => x.LogoFile).HasMaxLength(64);
            e.Property(x => x.ModelFile).HasMaxLength(64);
            e.Property(x => x.Schedules).HasConversion(
                v => JsonSerializer.Serialize(v.ToList(), (JsonSerializerOptions?)null),
                v => (IReadOnlyList<ScheduleSlot>)(JsonSerializer.Deserialize<List<ScheduleSlot>>(v, (JsonSerializerOptions?)null) ?? new List<ScheduleSlot>()),
                new ValueComparer<IReadOnlyList<ScheduleSlot>>(
                    (a, c) => a!.SequenceEqual(c!),
                    v => v.Aggregate(0, (h, x) => HashCode.Combine(h, x.GetHashCode())),
                    v => v.ToList()));
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

        b.Entity<AuditLog>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Action).IsRequired().HasMaxLength(100);
            e.Property(x => x.EntityName).HasMaxLength(100);
            e.Property(x => x.EntityId).HasMaxLength(64);
            e.Property(x => x.Details).HasMaxLength(1000);
            e.Property(x => x.IpAddress).HasMaxLength(64);
            e.HasIndex(x => x.ChurchId);
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<Member>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FullName).IsRequired().HasMaxLength(200);
            e.Property(x => x.Phone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(256);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ChurchId, x.FullName });
        });

        b.Entity<ChurchEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.Location).IsRequired().HasMaxLength(200);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Member>().WithMany().HasForeignKey(x => x.ResponsibleMemberId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Ministry>().WithMany().HasForeignKey(x => x.MinistryId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ChurchId, x.Date });
        });

        b.Entity<Attendance>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ChurchEvent>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            // No duplicate attendance for the same member at the same event, even under concurrency.
            e.HasIndex(x => new { x.EventId, x.MemberId }).IsUnique();
            e.HasIndex(x => x.MemberId);
        });

        b.Entity<Ministry>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(150);
            e.Property(x => x.Description).HasMaxLength(1000);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ChurchId, x.Name }).IsUnique();
        });

        b.Entity<MinistryMember>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Ministry>().WithMany().HasForeignKey(x => x.MinistryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.MinistryId, x.MemberId }).IsUnique();
        });

        b.Entity<Donation>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Concept).IsRequired().HasMaxLength(200);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ChurchId, x.Date });
        });

        b.Entity<Announcement>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(200);
            e.Property(x => x.Body).IsRequired().HasMaxLength(8000);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ChurchId, x.PublishDate });
        });

        b.Entity<ChurchArchiveBook>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).IsRequired().HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Author).HasMaxLength(150);
            e.Property(x => x.SpineColor).IsRequired().HasMaxLength(7);
            e.Property(x => x.StoredFileName).IsRequired().HasMaxLength(64);
            e.HasOne<Church>().WithMany().HasForeignKey(x => x.ChurchId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ChurchId, x.Title });
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
        // Rows are never physically removed: use Deactivate()/Cancel() so history and audit stay intact.
        if (ChangeTracker.Entries<BaseEntity>().Any(e => e.State == EntityState.Deleted && e.Entity is not AuditLog))
            throw new InvalidOperationException("Physical deletes are forbidden. Deactivate the entity instead.");

        // Audit rows are append-only.
        if (ChangeTracker.Entries<AuditLog>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("AuditLog is immutable.");

        var audits = new List<AuditLog>();
        foreach (var entry in ChangeTracker.Entries().Where(e => e.Entity is IAuditedEntity
                     && e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted))
        {
            var churchId = (entry.Entity as TenantEntity)?.ChurchId ?? _currentUser?.ChurchId;
            var name = entry.Entity.GetType().Name;
            var id = entry.Property("Id").CurrentValue?.ToString();
            var action = entry.State switch
            {
                EntityState.Added => "Created",
                EntityState.Deleted => "Deleted",
                _ => "Updated"
            };
            // Property names only: values may be personal or financial and must not leak into logs.
            var changed = entry.State == EntityState.Modified
                ? string.Join(",", entry.Properties.Where(p => p.IsModified).Select(p => p.Metadata.Name))
                : null;
            audits.Add(new AuditLog($"{name}.{action}", churchId, _currentUser?.UserId, name, id, changed, _currentUser?.IpAddress));
        }

        foreach (var entry in ChangeTracker.Entries<BaseEntity>().Where(e => e.State == EntityState.Modified))
            entry.Entity.Touch();

        AuditLogs.AddRange(audits);
    }
}









