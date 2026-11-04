using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChurchSeeker.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveChurchModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModelFile",
                table: "Churches");

            migrationBuilder.DropColumn(
                name: "ModelPath",
                table: "Churches");

            // The cathedral's seed point was about 75 m off its real footprint. Only a row still holding the old seed
            // value is corrected, so an administrator's own edit of the location is never overwritten.
            migrationBuilder.Sql("UPDATE \"Churches\" SET \"Latitude\" = 20.9671, \"Longitude\" = -89.6225 WHERE \"Id\" = '11111111-1111-1111-1111-111111111111' AND \"Latitude\" = 20.96737 AND \"Longitude\" = -89.62369;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ModelFile",
                table: "Churches",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModelPath",
                table: "Churches",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);


        }
    }
}
