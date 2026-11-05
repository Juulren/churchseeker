using Microsoft.EntityFrameworkCore;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ChurchSeeker.Infrastructure.Persistence;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, IConfiguration config)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (db.Database.IsNpgsql())
        {
            // PostgreSQL always goes through migrations, never EnsureCreated.
            if (config.GetValue("Database:Migrate", true)) await db.Database.MigrateAsync();
        }
        else if (config.GetValue("Database:AutoCreate", false))
            await db.Database.EnsureCreatedAsync();

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in Enum.GetNames<UserRole>())
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new IdentityRole<Guid>(role) { Id = Guid.NewGuid() });

        // The demonstration data and accounts (public passwords) exist only on a development database. Turning Seed:Demo on
        // anywhere else is a mistake that would publish those accounts, so the app refuses to start instead.
        var demo = config.GetValue("Seed:Demo", false);
        var development = scope.ServiceProvider.GetService<IHostEnvironment>()?.IsDevelopment() ?? false;
        if (demo && !development)
            throw new InvalidOperationException("Seed:Demo is only allowed in the Development environment.");
        if (demo)
        {
            await DemoDataSeeder.SeedAsync(services);
            await DemoAccountsSeeder.SeedAsync(services);
        }

        // The first platform account of a real deployment. Credentials come from configuration/secrets, never from code.
        await SeedPlatformAccountAsync(scope.ServiceProvider, config);

        // Every user has an access row for their home church (this also covers users from before the table existed).
        await scope.ServiceProvider.GetRequiredService<ChurchAccess>().EnsureHomeRowsAsync();

        // Optional first administrator. Credentials come from configuration/secrets, never from code.
        var email = config["Seed:AdminEmail"];
        var password = config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        if (await users.FindByEmailAsync(email) is not null) return;

        var churchId = Guid.TryParse(config["Seed:AdminChurchId"], out var id) ? id : ChurchSeedData.CathedralId;
        var admin = new ApplicationUser
        {
            Id = Guid.NewGuid(), UserName = email, Email = email, EmailConfirmed = true,
            FullName = "Administrador", ChurchId = churchId
        };
        var created = await users.CreateAsync(admin, password);
        if (!created.Succeeded)
            throw new InvalidOperationException("Seed admin failed: " + string.Join("; ", created.Errors.Select(e => e.Description)));
        await users.AddToRoleAsync(admin, nameof(UserRole.Administrador));
        await scope.ServiceProvider.GetRequiredService<ChurchAccess>().EnsureHomeRowsAsync();
    }

    private static async Task SeedPlatformAccountAsync(IServiceProvider sp, IConfiguration config)
    {
        var email = config["Seed:SuperEmail"];
        var password = config["Seed:SuperPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;
        var users = sp.GetRequiredService<UserManager<ApplicationUser>>();
        if (await users.FindByEmailAsync(email) is not null) return;
        var churchId = Guid.TryParse(config["Seed:SuperChurchId"], out var id) ? id : ChurchSeedData.CathedralId;
        var super = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email, EmailConfirmed = true, FullName = "Super Administrador", ChurchId = churchId };
        var created = await users.CreateAsync(super, password);
        if (!created.Succeeded)
            throw new InvalidOperationException("Seed platform account failed: " + string.Join("; ", created.Errors.Select(e => e.Description)));
        await users.AddToRoleAsync(super, nameof(UserRole.SuperAdministrador));
    }
}
