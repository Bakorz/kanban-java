package id.bakorz.kanban.model;

import java.util.List;

public record BoardDetail(Board board, List<BoardColumn> columns) {
    public BoardDetail { columns = List.copyOf(columns); }
}
