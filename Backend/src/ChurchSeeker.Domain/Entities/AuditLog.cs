using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// Append-only. Never store member identity on anonymous donations or secrets/PII in Details.
public class AuditLog : BaseEntity
{
    public Guid? ChurchId { get; private set; }
    public Guid? UserId { get; private set; }
    public string Action { get; private set; } = string.Empty;
    public string? EntityName { get; private set; }
    public string? EntityId { get; private set; }
    public string? Details { get; private set; }
    public string? IpAddress { get; private set; }

    private AuditLog() { }

    public AuditLog(string action, Guid? churchId, Guid? userId, string? entityName = null,
                    string? entityId = null, string? details = null, string? ipAddress = null)
    {
        if (string.IsNullOrWhiteSpace(action)) throw new DomainException("Action is required.");
        Action = Cut(action, 100)!;
        ChurchId = churchId;
        UserId = userId;
        EntityName = Cut(entityName, 100);
        EntityId = Cut(entityId, 64);
        Details = Cut(details, 1000);
        IpAddress = Cut(ipAddress, 64);
    }

    private static string? Cut(string? v, int max) =>
        v is null ? null : v.Length <= max ? v : v[..max];
}
