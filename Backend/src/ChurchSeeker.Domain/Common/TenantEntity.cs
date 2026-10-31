using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Common;

// Data owned by a single church. ChurchId drives the global tenant filter.
public abstract class TenantEntity : BaseEntity
{
    public Guid ChurchId { get; protected set; }

    protected TenantEntity() { }

    protected TenantEntity(Guid churchId)
    {
        if (churchId == Guid.Empty)
            throw new DomainException("ChurchId is required.");
        ChurchId = churchId;
    }
}
