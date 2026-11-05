using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChurchSeeker.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChurchHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "History",
                table: "Churches",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Churches",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "History",
                value: "La Catedral de San Ildefonso es la sede de la Arquidiócesis de Yucatán y se la considera de las primeras catedrales construidas en tierra firme americana. Sus obras comenzaron hacia 1562, sobre una capilla de San José, y se dieron por concluidas en 1598.\n\nEl proyecto fue encomendado a Pedro de Aulestia y lo completaron Juan Miguel de Agüero y Gregorio de la Torre. Es de cantera, con una fachada renacentista y torres de aire morisco. En 1915 sufrió saqueos durante la entrada de fuerzas revolucionarias a la ciudad.");

            migrationBuilder.UpdateData(
                table: "Churches",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "History",
                value: "La Iglesia de Santa Lucía nació como una capilla para dar servicio religioso a los vecinos del barrio, poco después de la fundación de Mérida en 1542. Según una de las fuentes, su construcción se concluyó hacia 1575, y alcanzó su tamaño actual hacia 1760. Tiene una entrada rectangular enmarcada en cantera, un vitral y una espadaña.\n\nEn 1804 el gobernador Benito Pérez Valdelomar convirtió en plaza el terreno del actual parque, que era un basurero. Desde 1965 el Parque de Santa Lucía ofrece serenatas yucatecas los jueves.");

            migrationBuilder.UpdateData(
                table: "Churches",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"),
                column: "History",
                value: "La Iglesia de Jesús, conocida como la Tercera Orden, la levantó la Compañía de Jesús a partir de 1618 como parte de un colegio que ocupaba toda la manzana; hoy es el único edificio que sobrevive de aquel conjunto.\n\nTras la expulsión de los jesuitas, en 1767, pasó a la Tercera Orden franciscana, de la que toma su nombre popular. Su planta es de cruz latina, con bóvedas de cañón y cúpulas sin tambor.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "History",
                table: "Churches");
        }
    }
}
