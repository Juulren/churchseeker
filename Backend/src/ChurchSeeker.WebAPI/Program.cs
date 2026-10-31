using System.Text;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Infrastructure;
using ChurchSeeker.Infrastructure.Persistence;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddAppRateLimiting(builder.Configuration);

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (allowedOrigins.Any(o => o.Trim() == "*" || !Uri.TryCreate(o, UriKind.Absolute, out _)))
    throw new InvalidOperationException("Cors:AllowedOrigins must list explicit absolute origins (no wildcard).");
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    // No configured origins means no cross-origin access at all.
    if (allowedOrigins.Length > 0)
        p.WithOrigins(allowedOrigins)
         .WithMethods("GET", "POST", "PUT", "DELETE")
         .WithHeaders("Content-Type", "Authorization")
         .AllowCredentials();
}));

var jwt = builder.Configuration.GetSection("Jwt");
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt["Issuer"] ?? "churchseeker",
            ValidateAudience = true,
            ValidAudience = jwt["Audience"] ?? "churchseeker-clients",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ClockSkew = TimeSpan.Zero,
            NameClaimType = "sub",
            RoleClaimType = "role"
        };
    });

builder.Services.AddAuthorization(o =>
{
    o.AddPolicy(Policies.AdminOnly, p => p.RequireRole("Administrador"));
    o.AddPolicy(Policies.Finance, p => p.RequireRole("Tesorero", "Administrador"));
    o.AddPolicy(Policies.Management, p => p.RequireRole("Administrador", "Pastor", "Secretario"));
});

var app = builder.Build();

await DatabaseInitializer.InitializeAsync(app.Services, app.Configuration);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSecurityHeaders(allowSwagger: app.Environment.IsDevelopment());
if (!app.Environment.IsDevelopment())
    app.UseHsts();
app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

public partial class Program;

