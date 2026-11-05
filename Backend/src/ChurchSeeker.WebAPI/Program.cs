using System.Text;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Infrastructure;
using ChurchSeeker.Infrastructure.Persistence;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// `--bootstrap`: apply the migrations, create the roles and the platform account, then exit. Run it by hand against the database
// (with the direct connection string) before a deployment; the running server then starts without touching the schema.
var bootstrap = args.Contains("--bootstrap");
if (bootstrap) builder.Configuration["Database:Migrate"] = "true";

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddAppRateLimiting(builder.Configuration);

// Behind a proxy (Vercel) the client address is in X-Forwarded-For. Only trusted when the deployment says it is behind one:
// otherwise anyone could pick the address that the rate limits see.
var behindProxy = builder.Configuration.GetValue("ForwardedHeaders:Enabled", false);
if (behindProxy)
    builder.Services.Configure<ForwardedHeadersOptions>(o =>
    {
        o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        o.ForwardLimit = 1;
        o.ForwardedForHeaderName = builder.Configuration["ForwardedHeaders:ForwardedForHeaderName"] ?? "X-Forwarded-For";
        o.KnownNetworks.Clear();
        o.KnownProxies.Clear();
    });

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
        // A valid signature is not enough: the user must still exist, be active and still hold the role in the token.
        // That makes a deactivation or a role change effective immediately, not after the 15-minute token expires.
        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = async ctx =>
            {
                var sub = ctx.Principal?.FindFirst("sub")?.Value;
                var role = ctx.Principal?.FindFirst("role")?.Value;
                var church = ctx.Principal?.FindFirst("church_id")?.Value;
                var users = ctx.HttpContext.RequestServices.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ChurchSeeker.Infrastructure.Identity.ApplicationUser>>();
                var user = Guid.TryParse(sub, out _) ? await users.FindByIdAsync(sub!) : null;
                if (user is null || !user.IsActive || string.IsNullOrEmpty(role) || !await users.IsInRoleAsync(user, role)
                    || !Guid.TryParse(church, out var churchId))
                {
                    ctx.Fail("The session is no longer valid.");
                    return;
                }
                // The church in the token must still be one this user may use (and active): taking an access away, or switching
                // a church off, ends that session on its very next request.
                var access = ctx.HttpContext.RequestServices.GetRequiredService<ChurchSeeker.Infrastructure.Identity.ChurchAccess>();
                if (!await access.CanUseAsync(user.Id, role == "SuperAdministrador", churchId))
                    ctx.Fail("The session is no longer valid.");
            }
        };
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
    // The platform account may do everything an Administrador can, inside the church it is working in.
    o.AddPolicy(Policies.AdminOnly, p => p.RequireRole("Administrador", "SuperAdministrador"));
    o.AddPolicy(Policies.Finance, p => p.RequireRole("Tesorero", "Administrador", "SuperAdministrador"));
    o.AddPolicy(Policies.Management, p => p.RequireRole("Administrador", "Pastor", "Secretario", "SuperAdministrador"));
    o.AddPolicy(Policies.MinistryAccess, p => p.RequireRole("Administrador", "Pastor", "Secretario", "Coordinador", "SuperAdministrador"));
    o.AddPolicy(Policies.PlatformOnly, p => p.RequireRole("SuperAdministrador"));
    // Any signed-in account, including a plain Usuario (the account page and the church switch).
    o.AddPolicy(Policies.Authenticated, p => p.RequireAuthenticatedUser());
    // A bare [Authorize] means staff: everything except a plain Usuario, so new endpoints are closed to it by default.
    o.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser()
        .RequireRole("Administrador", "Pastor", "Secretario", "Tesorero", "Coordinador", "SuperAdministrador").Build();
});

var app = builder.Build();

// The schema and the seeds are applied on start-up in development, and by `--bootstrap` anywhere else (a serverless instance
// that starts cold should not migrate, seed or scan users).
if (bootstrap || app.Configuration.GetValue("Database:RunOnStart", app.Environment.IsDevelopment()))
    await DatabaseInitializer.InitializeAsync(app.Services, app.Configuration);
if (bootstrap) return;

if (behindProxy) app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSecurityHeaders(allowSwagger: app.Environment.IsDevelopment());
if (!app.Environment.IsDevelopment())
    app.UseHsts();
app.UseHttpsRedirection();

// The built web app, when the container carries it in wwwroot (one origin: the API and the pages share cookies and need no CORS).
var webRoot = app.Environment.WebRootPath;
var hasWeb = webRoot is not null && File.Exists(Path.Combine(webRoot, "index.html"));
if (hasWeb)
{
    app.UseDefaultFiles();
    app.UseStaticFiles(new StaticFileOptions
    {
        // Built assets carry a hash in their name and never change.
        OnPrepareResponse = c =>
        {
            if (c.Context.Request.Path.StartsWithSegments("/assets"))
                c.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        }
    });
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
if (hasWeb)
    app.MapFallback(async ctx =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api")) { ctx.Response.StatusCode = StatusCodes.Status404NotFound; return; }
        ctx.Response.Headers.CacheControl = "no-cache";
        ctx.Response.ContentType = "text/html; charset=utf-8";
        await ctx.Response.SendFileAsync(Path.Combine(webRoot!, "index.html"));
    });

app.Run();

public partial class Program;


