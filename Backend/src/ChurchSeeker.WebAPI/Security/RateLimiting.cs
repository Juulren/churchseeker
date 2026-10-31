using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace ChurchSeeker.WebAPI.Security;

public static class RateLimitPolicies
{
    public const string Auth = "auth";
    // Reserved for report and export endpoints (RF-09).
    public const string Reports = "reports";

    public static IServiceCollection AddAppRateLimiting(this IServiceCollection services, IConfiguration config)
    {
        var global = config.GetValue("RateLimiting:Global", 300);
        var auth = config.GetValue("RateLimiting:Auth", 10);
        var reports = config.GetValue("RateLimiting:Reports", 10);

        static string Key(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        static FixedWindowRateLimiterOptions Window(int limit) =>
            new() { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 };

        return services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = (ctx, _) =>
            {
                ctx.HttpContext.Response.Headers.RetryAfter = "60";
                return ValueTask.CompletedTask;
            };
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetFixedWindowLimiter("g:" + Key(ctx), _ => Window(global)));
            o.AddPolicy(Auth, ctx => RateLimitPartition.GetFixedWindowLimiter("a:" + Key(ctx), _ => Window(auth)));
            o.AddPolicy(Reports, ctx => RateLimitPartition.GetFixedWindowLimiter("r:" + Key(ctx), _ => Window(reports)));
        });
    }
}
