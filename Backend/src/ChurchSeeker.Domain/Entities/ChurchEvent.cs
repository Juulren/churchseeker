using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

public class ChurchEvent : TenantEntity, IAuditedEntity
{
    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public DateOnly Date { get; private set; }
    public TimeOnly Time { get; private set; }
    public string Location { get; private set; } = string.Empty;
    public EventKind Kind { get; private set; }
    // Only public events appear on the anonymous church calendar.
    public bool IsPublic { get; private set; }
    public Guid? ResponsibleMemberId { get; private set; }
    public bool IsCancelled { get; private set; }
    public Guid? MinistryId { get; private set; }

    private ChurchEvent() { }

    public ChurchEvent(Guid churchId, string title, string? description, DateOnly date, TimeOnly time,
                       string location, EventKind kind, bool isPublic, Guid? responsibleMemberId, Guid? ministryId = null)
        : base(churchId) => Apply(title, description, date, time, location, kind, isPublic, responsibleMemberId, ministryId);

    public void Update(string title, string? description, DateOnly date, TimeOnly time,
                       string location, EventKind kind, bool isPublic, Guid? responsibleMemberId, Guid? ministryId = null) =>
        Apply(title, description, date, time, location, kind, isPublic, responsibleMemberId, ministryId);

    public void Cancel() { IsCancelled = true; Touch(); }
    public void Restore() { IsCancelled = false; Touch(); }

    private void Apply(string title, string? description, DateOnly date, TimeOnly time,
                       string location, EventKind kind, bool isPublic, Guid? responsibleMemberId, Guid? ministryId = null)
    {
        var t = RequirePlainText(title, nameof(Title), 200);
        var d = OptionalPlainText(description, nameof(Description), 4000);
        var l = RequirePlainText(location, nameof(Location), 200);
        if (!Enum.IsDefined(kind)) throw new DomainException("Kind is invalid.");
        if (date.Year is < 2000 or > 2100) throw new DomainException("Date is out of range.");
        if (responsibleMemberId == Guid.Empty) throw new DomainException("ResponsibleMemberId is invalid.");
        if (ministryId == Guid.Empty) throw new DomainException("MinistryId is invalid.");

        Title = t; Description = d; Location = l; Kind = kind;
        Date = date; Time = time; IsPublic = isPublic; ResponsibleMemberId = responsibleMemberId; MinistryId = ministryId;
        Touch();
    }
}

