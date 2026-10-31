using ChurchSeeker.Domain.Common;

namespace ChurchSeeker.Application.Common;

// Reads go through Query(); the tenant filter on the DbContext is applied to every query.
public interface IRepository<T> where T : BaseEntity
{
    IQueryable<T> Query();
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task AddAsync(T entity, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
