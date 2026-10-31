using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// One row per (event, member). A unique index in the database enforces it even under concurrency.
public class Attendance : TenantEntity, IAuditedEntity
{
    public Guid EventId { get; private set; }
    public Guid MemberId { get; private set; }
    public bool Present { get; private set; }

    private Attendance() { }

    public Attendance(Guid churchId, Guid eventId, Guid memberId, bool present) : base(churchId)
    {
        if (eventId == Guid.Empty) throw new DomainException("EventId is required.");
        if (memberId == Guid.Empty) throw new DomainException("MemberId is required.");
        EventId = eventId;
        MemberId = memberId;
        Present = present;
    }

    public void Mark(bool present)
    {
        Present = present;
        Touch();
    }
}
