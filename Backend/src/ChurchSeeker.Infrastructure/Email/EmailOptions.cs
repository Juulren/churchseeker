namespace ChurchSeeker.Infrastructure.Email;

public class EmailOptions
{
    public const string Section = "Email";
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public bool UseSsl { get; set; }
    public string? User { get; set; }
    public string? Password { get; set; }
    public string From { get; set; } = "ChurchSeeker <no-reply@churchseeker.local>";
    // Where the frontend lives: the reset link points to {ResetBaseUrl}/#/reset?email=..&token=..
    public string ResetBaseUrl { get; set; } = "http://localhost:5173";
}
