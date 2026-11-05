using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.Infrastructure.Persistence;

/// <summary>
/// The demonstration accounts of the README: one for each kind of access. They exist ONLY on a development database:
/// the initializer runs this only when Seed:Demo is on AND the environment is Development, and refuses to start if Seed:Demo
/// is on anywhere else. Their passwords are public (they are in the README), so they must never reach a real deployment.
/// </summary>
public static class DemoAccountsSeeder
{
    public sealed record Account(string Email, string Password, string FullName, UserRole Role, Guid Home, Guid[] Extra);

    public static readonly Account[] Accounts =
    [
        new("superadmin@churchseeker.local", "Super!Plataforma2026#", "Super Administrador", UserRole.SuperAdministrador, ChurchSeedData.CathedralId, []),
        new("admin@churchseeker.local", "Adm1n!Passw0rd#", "Administrador de la Catedral", UserRole.Administrador, ChurchSeedData.CathedralId, []),
        new("admin.jesus@churchseeker.local", "Adm1n!Jesus2026#", "Administrador de Jesús y Santa Lucía", UserRole.Administrador, ChurchSeedData.JesusId, [ChurchSeedData.SantaLuciaId]),
        new("usuario@churchseeker.local", "Usu4rio!Normal2026#", "Usuario", UserRole.Usuario, ChurchSeedData.CathedralId, [])
    ];

    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var a in Accounts)
        {
            var user = await users.FindByEmailAsync(a.Email);
            if (user is null)
            {
                user = new ApplicationUser { Id = Guid.NewGuid(), UserName = a.Email, Email = a.Email, EmailConfirmed = true, FullName = a.FullName, ChurchId = a.Home };
                var created = await users.CreateAsync(user, a.Password);
                if (!created.Succeeded) throw new InvalidOperationException($"Demo account {a.Email} failed: " + string.Join("; ", created.Errors.Select(e => e.Description)));
                await users.AddToRoleAsync(user, a.Role.ToString());
            }
            // Also for an account that already exists: an interrupted earlier start-up may have left it without its role or its access rows.
            if ((await users.GetRolesAsync(user)).Count == 0) await users.AddToRoleAsync(user, a.Role.ToString());
            foreach (var church in a.Extra.Prepend(a.Home))
                if (!await db.UserChurchAccess.AnyAsync(x => x.UserId == user.Id && x.ChurchId == church))
                    db.UserChurchAccess.Add(new UserChurchAccess(user.Id, church));
            await db.SaveChangesAsync();
        }
    }
}
