using ChurchSeeker.Application.Auditing;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Events;
using ChurchSeeker.Application.Members;
using ChurchSeeker.Infrastructure.Services;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using ChurchSeeker.Infrastructure.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ChurchSeeker.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
        if (System.Text.Encoding.UTF8.GetByteCount(jwt.Key) < 32)
            throw new InvalidOperationException("Jwt:Key must be at least 32 bytes. Set it via environment or user-secrets.");
        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));

        services.AddDbContext<AppDbContext>(o =>
            o.UseSqlite(config.GetConnectionString("Default") ?? "Data Source=churchseeker.db"));

        services.AddDataProtection();
        services.AddIdentityCore<ApplicationUser>(o =>
            {
                o.Password.RequiredLength = 10;
                o.Password.RequireDigit = true;
                o.Password.RequireLowercase = true;
                o.Password.RequireUppercase = true;
                o.Password.RequireNonAlphanumeric = true;
                o.Password.RequiredUniqueChars = 4;
                o.User.RequireUniqueEmail = true;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();
        services.Configure<DataProtectionTokenProviderOptions>(o => o.TokenLifespan = TimeSpan.FromMinutes(30));

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<ITokenService, TokenService>();
        services.AddScoped<IEmailSender, LoggingEmailSender>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
        services.AddScoped<IMemberService, MemberService>();
        services.AddScoped<PublicTenantScope>();
        services.AddScoped<EventService>();
        services.AddScoped<IEventService>(sp => sp.GetRequiredService<EventService>());
        services.AddScoped<IPublicEventService>(sp => sp.GetRequiredService<EventService>());
        return services;
    }
}



