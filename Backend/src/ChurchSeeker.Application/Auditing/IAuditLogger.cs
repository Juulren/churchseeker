namespace ChurchSeeker.Application.Auditing;

public record AuditEntry(
    string Action,
    Guid? ChurchId = null,
    Guid? UserId = null,
    string? EntityName = null,
    string? EntityId = null,
    string? Details = null);

public interface IAuditLogger
{
    Task WriteAsync(AuditEntry entry, CancellationToken ct = default);
}
