namespace ChurchSeeker.Application.Storage;

public enum FileKind { Logo, Model, Book }

public interface IFileStorage
{
    // Stores the bytes under a server-generated name (GUID + extension) and returns that name.
    Task<string> SaveAsync(FileKind kind, byte[] content, string extension, CancellationToken ct = default);
    // Returns null when the name is malformed or the file does not exist (no path is ever built from user input).
    Stream? OpenRead(FileKind kind, string storedName);
}
