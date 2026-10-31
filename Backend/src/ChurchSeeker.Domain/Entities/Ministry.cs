using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

public class Ministry : TenantEntity, IAuditedEntity
{
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    // A system user with the Coordinador role in the same church.
    public Guid? CoordinatorUserId { get; private set; }

    private Ministry() { }

    public Ministry(Guid churchId, string name, string? description, Guid? coordinatorUserId) : base(churchId) =>
        Apply(name, description, coordinatorUserId);

    public void Update(string name, string? description, Guid? coordinatorUserId) => Apply(name, description, coordinatorUserId);

    private void Apply(string name, string? description, Guid? coordinatorUserId)
    {
        var n = RequirePlainText(name, nameof(Name), 150);
        var d = OptionalPlainText(description, nameof(Description), 1000);
        if (coordinatorUserId == Guid.Empty) throw new DomainException("CoordinatorUserId is invalid.");
        Name = n; Description = d; CoordinatorUserId = coordinatorUserId;
        Touch();
    }
}

// Membership link. Removing a member deactivates the link so history is kept.
public class MinistryMember : TenantEntity, IAuditedEntity
{
    public Guid MinistryId { get; private set; }
    public Guid MemberId { get; private set; }

    private MinistryMember() { }

    public MinistryMember(Guid churchId, Guid ministryId, Guid memberId) : base(churchId)
    {
        if (ministryId == Guid.Empty || memberId == Guid.Empty) throw new DomainException("Ministry and member are required.");
        MinistryId = ministryId;
        MemberId = memberId;
    }
}
