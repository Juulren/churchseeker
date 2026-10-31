using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// Plain text only (markup is rejected), so the body is safe to render anywhere.
// "Delete" means deactivate: the record and its audit trail stay.
public class Announcement : TenantEntity, IAuditedEntity
{
    public string Title { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public DateOnly PublishDate { get; private set; }
    public DateOnly? ExpiresOn { get; private set; }
    public bool IsImportant { get; private set; }
    public bool IsPublic { get; private set; }

    private Announcement() { }

    public Announcement(Guid churchId, string title, string body, DateOnly publishDate, DateOnly? expiresOn,
                        bool isImportant, bool isPublic) : base(churchId) =>
        Apply(title, body, publishDate, expiresOn, isImportant, isPublic);

    public void Update(string title, string body, DateOnly publishDate, DateOnly? expiresOn, bool isImportant, bool isPublic) =>
        Apply(title, body, publishDate, expiresOn, isImportant, isPublic);

    // Visible to the public on a given day: published, not expired, not deleted, marked public.
    public bool IsVisibleOn(DateOnly day) =>
        IsActive && IsPublic && PublishDate <= day && (ExpiresOn is null || ExpiresOn >= day);

    private void Apply(string title, string body, DateOnly publishDate, DateOnly? expiresOn, bool isImportant, bool isPublic)
    {
        var t = RequirePlainText(title, nameof(Title), 200);
        var b = RequirePlainText(body, nameof(Body), 8000);
        if (publishDate.Year is < 2000 or > 2100) throw new DomainException("PublishDate is out of range.");
        if (expiresOn is { } e && (e < publishDate || e.Year > 2100)) throw new DomainException("ExpiresOn must not be before PublishDate.");
        Title = t; Body = b; PublishDate = publishDate; ExpiresOn = expiresOn; IsImportant = isImportant; IsPublic = isPublic;
        Touch();
    }
}
