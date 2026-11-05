namespace ChurchSeeker.Domain.Enums;

public enum UserRole
{
    Administrador = 1,
    Pastor = 2,
    Secretario = 3,
    Tesorero = 4,
    Coordinador = 5,
    /// <summary>The platform: sees and may act in every church and has the general dashboard. Never assignable through a church.</summary>
    SuperAdministrador = 6,
    /// <summary>A plain account: no access to the administration panel or to any staff data.</summary>
    Usuario = 7
}

public static class UserRoles
{
    /// <summary>The roles a church administrator may give. SuperAdministrador is never in it: it comes only from the seed or the platform.</summary>
    public static readonly IReadOnlySet<UserRole> ChurchAssignable = new HashSet<UserRole>
    {
        UserRole.Administrador, UserRole.Pastor, UserRole.Secretario, UserRole.Tesorero, UserRole.Coordinador, UserRole.Usuario
    };

    /// <summary>Staff roles: the ones that may open the administration panel.</summary>
    public static bool IsStaff(UserRole role) => role != UserRole.Usuario;
}
