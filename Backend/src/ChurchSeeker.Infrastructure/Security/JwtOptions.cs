namespace ChurchSeeker.Infrastructure.Security;

public class JwtOptions
{
    public const string Section = "Jwt";
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = "churchseeker";
    public string Audience { get; set; } = "churchseeker-clients";
    public int AccessMinutes { get; set; } = 15;
    public int RefreshDays { get; set; } = 7;
}
