namespace ChurchSeeker.Infrastructure.Persistence;

// Lets an anonymous request read ONE explicitly named church through the normal tenant filter.
// The filter still applies, so nothing outside that church is reachable.
public sealed class PublicTenantScope
{
    public Guid? ChurchId { get; private set; }
    public void Use(Guid churchId) => ChurchId = churchId;
}
