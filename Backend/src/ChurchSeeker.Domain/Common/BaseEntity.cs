using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Common;

public abstract class BaseEntity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; protected set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; protected set; }
    public bool IsActive { get; protected set; } = true;

    public void Touch() => UpdatedAt = DateTime.UtcNow;

    // Soft delete only: physical deletes are forbidden by design.
    public void Deactivate()
    {
        IsActive = false;
        Touch();
    }

    public void Activate()
    {
        IsActive = true;
        Touch();
    }

    protected static string RequireText(string? value, string field, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new DomainException($"{field} is required.");
        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
            throw new DomainException($"{field} exceeds {maxLength} characters.");
        return trimmed;
    }

    // Markup characters are rejected in plain-text fields: defence in depth against stored XSS.
    protected static string RequirePlainText(string? value, string field, int maxLength)
    {
        var text = RequireText(value, field, maxLength);
        if (text.AsSpan().IndexOfAny('<', '>') >= 0)
            throw new DomainException($"{field} contains invalid characters.");
        return text;
    }

    protected static string? OptionalPlainText(string? value, string field, int maxLength) =>
        string.IsNullOrWhiteSpace(value) ? null : RequirePlainText(value, field, maxLength);
}

