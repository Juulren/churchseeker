using ChurchSeeker.Application.Auditing;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Entities;

namespace ChurchSeeker.Infrastructure.Persistence;

public sealed class AuditLogger : IAuditLogger
{
    private readonly AppDbContext _db;
    private readonly ICurrentUser _current;

    public AuditLogger(AppDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    public async Task WriteAsync(AuditEntry e, CancellationToken ct = default)
    {
        _db.AuditLogs.Add(new AuditLog(e.Action, e.ChurchId ?? _current.ChurchId, e.UserId ?? _current.UserId,
            e.EntityName, e.EntityId, e.Details, _current.IpAddress));
        await _db.SaveChangesAsync(ct);
    }
}
