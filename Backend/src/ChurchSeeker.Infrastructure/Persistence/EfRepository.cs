using ChurchSeeker.Application.Common;
using ChurchSeeker.Domain.Common;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Persistence;

public sealed class EfRepository<T> : IRepository<T> where T : BaseEntity
{
    private readonly AppDbContext _db;

    public EfRepository(AppDbContext db) => _db = db;

    public IQueryable<T> Query() => _db.Set<T>();
    public Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default) => _db.Set<T>().FirstOrDefaultAsync(x => x.Id == id, ct);
    public async Task AddAsync(T entity, CancellationToken ct = default) => await _db.Set<T>().AddAsync(entity, ct);
    public Task SaveChangesAsync(CancellationToken ct = default) => _db.SaveChangesAsync(ct);
}
