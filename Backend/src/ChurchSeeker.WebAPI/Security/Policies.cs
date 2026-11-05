namespace ChurchSeeker.WebAPI.Security;

public static class Policies
{
    public const string AdminOnly = "AdminOnly";
    // Donations and income data: Tesorero and Administrador only.
    public const string Finance = "Finance";
    // Member, event and ministry management.
    public const string Management = "Management";
    // Management plus Coordinador (service restricts a coordinator to their own ministries).
    public const string MinistryAccess = "MinistryAccess";
    // The platform account only: the general dashboard and the church access management.
    public const string PlatformOnly = "PlatformOnly";
    // Any signed-in account, a plain Usuario included.
    public const string Authenticated = "Authenticated";
}

