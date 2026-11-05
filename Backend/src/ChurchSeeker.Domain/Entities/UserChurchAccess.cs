namespace ChurchSeeker.Domain.Entities;

/// <summary>
/// A church a user may work in. Every user has one for their home church; only the platform adds more, and only for
/// administrators. Not a tenant entity: it is the table that says which tenants a user may use. Rows are removed for real.
/// </summary>
public class UserChurchAccess
{
    public Guid UserId { get; private set; }
    public Guid ChurchId { get; private set; }
    public DateTime GrantedAt { get; private set; } = DateTime.UtcNow;

    private UserChurchAccess() { }

    public UserChurchAccess(Guid userId, Guid churchId)
    {
        UserId = userId;
        ChurchId = churchId;
    }
}
