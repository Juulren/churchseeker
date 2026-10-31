using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

public record ScheduleSlot(DayOfWeek Day, TimeOnly Time, string Description);

// Root of the tenant tree: not a TenantEntity, it IS the tenant.
public class Church : BaseEntity
{
    public const int MaxSchedules = 30;

    public string Name { get; private set; } = string.Empty;
    public string Denomination { get; private set; } = string.Empty;
    public string PatronSaint { get; private set; } = string.Empty;
    public string Address { get; private set; } = string.Empty;
    public double Latitude { get; private set; }
    public double Longitude { get; private set; }
    // Default 3D model shipped with the frontend (static path). An uploaded model overrides it.
    public string? ModelPath { get; private set; }
    public string? ContactPhone { get; private set; }
    public string? ContactEmail { get; private set; }
    // Server-generated storage names (GUID + extension), never user-supplied file names.
    public string? LogoFile { get; private set; }
    public string? ModelFile { get; private set; }
    public IReadOnlyList<ScheduleSlot> Schedules { get; private set; } = [];

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

    public void UpdateProfile(string name, string denomination, string patronSaint, string address,
                              string? phone, string? email, double latitude, double longitude,
                              IReadOnlyList<ScheduleSlot> schedules)
    {
        var n = RequirePlainText(name, nameof(Name), 200);
        var d = RequirePlainText(denomination, nameof(Denomination), 100);
        var p = RequirePlainText(patronSaint, nameof(PatronSaint), 150);
        var a = RequirePlainText(address, nameof(Address), 300);
        var ph = OptionalPlainText(phone, nameof(ContactPhone), 30);
        if (ph is not null && !ContactValidator.IsValidPhone(ph)) throw new DomainException("ContactPhone has an invalid format.");
        var em = OptionalPlainText(email, nameof(ContactEmail), 256);
        if (em is not null && !ContactValidator.IsValidEmail(em)) throw new DomainException("ContactEmail has an invalid format.");
        if (schedules is null || schedules.Count > MaxSchedules) throw new DomainException($"At most {MaxSchedules} schedules are allowed.");
        var clean = schedules.Select(s =>
        {
            if (!Enum.IsDefined(s.Day)) throw new DomainException("Schedule day is invalid.");
            return s with { Description = RequirePlainText(s.Description, "Schedule description", 150) };
        }).OrderBy(s => s.Day == DayOfWeek.Sunday ? 7 : (int)s.Day).ThenBy(s => s.Time).ToList();

        SetLocation(latitude, longitude);
        Name = n; Denomination = d; PatronSaint = p; Address = a; ContactPhone = ph; ContactEmail = em;
        Schedules = clean;
        Touch();
    }

    public void SetLogo(string storedName) { LogoFile = storedName; Touch(); }
    public void SetModel(string storedName) { ModelFile = storedName; Touch(); }
}
