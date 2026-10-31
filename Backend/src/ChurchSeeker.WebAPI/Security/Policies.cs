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
}

