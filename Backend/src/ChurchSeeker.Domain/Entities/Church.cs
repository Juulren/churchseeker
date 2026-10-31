using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// Root of the tenant tree: not a TenantEntity, it IS the tenant.
public class Church : BaseEntity
{
    public string Name { get; private set; } = string.Empty;
    public string Denomination { get; private set; } = string.Empty;
    public string PatronSaint { get; private set; } = string.Empty;
    public string Address { get; private set; } = string.Empty;
    public double Latitude { get; private set; }
    public double Longitude { get; private set; }
    public string? ModelPath { get; private set; }

    private Church() { }

    public Church(Guid id, string name, string denomination, string patronSaint,
                  string address, double latitude, double longitude, string? modelPath = null)
    {
        if (id == Guid.Empty) throw new DomainException("Id is required.");
        Id = id;
        Name = RequireText(name, nameof(Name), 200);
        Denomination = RequireText(denomination, nameof(Denomination), 100);
        PatronSaint = RequireText(patronSaint, nameof(PatronSaint), 150);
        Address = RequireText(address, nameof(Address), 300);
        SetLocation(latitude, longitude);
        ModelPath = modelPath;
    }

    public void SetLocation(double latitude, double longitude)
    {
        if (double.IsNaN(latitude) || latitude is < -90 or > 90)
            throw new DomainException("Latitude out of range.");
        if (double.IsNaN(longitude) || longitude is < -180 or > 180)
            throw new DomainException("Longitude out of range.");
        Latitude = latitude;
        Longitude = longitude;
        Touch();
    }
}
