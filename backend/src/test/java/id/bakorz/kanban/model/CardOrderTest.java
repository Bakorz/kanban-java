package id.bakorz.kanban.model;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class CardOrderTest {
    private final UUID a = UUID.randomUUID();
    private final UUID b = UUID.randomUUID();
    private final UUID c = UUID.randomUUID();
    private final UUID d = UUID.randomUUID();

    @Test void sameColumnMovesBothDirectionsUsingFinalIndex() {
        var source = List.of(a, b, c);
        assertEquals(List.of(b, c, a), CardOrder.move(source, source, a, 2, true).source());
        assertEquals(List.of(c, a, b), CardOrder.move(source, source, c, 0, true).destination());
        assertEquals(source, CardOrder.move(source, source, b, 1, true).source());
        assertEquals(List.of(a, b, c), source);
    }
    @Test void crossColumnAllowsFirstLastAndEmptyDestination() {
        assertEquals(List.of(a), CardOrder.move(List.of(a), List.of(), a, 0, false).destination());
        var first = CardOrder.move(List.of(a, b), List.of(c, d), b, 0, false);
        assertEquals(List.of(a), first.source());
        assertEquals(List.of(b, c, d), first.destination());
        assertEquals(List.of(c, d, b), CardOrder.move(List.of(a, b), List.of(c, d), b, 2, false).destination());
    }
    @Test void invalidFinalPositionsNeverClampSilently() {
        for (int p : new int[]{-1, 3, Integer.MAX_VALUE}) {
            assertThrows(Inputs.InvalidInput.class, () -> CardOrder.move(List.of(a,b,c), List.of(a,b,c), b, p, true));
        }
        assertThrows(Inputs.InvalidInput.class, () -> CardOrder.move(List.of(a), List.of(), a, 1, false));
    }
    @Test void deleteCompactsAndReturnsImmutableSnapshot() {
        var remaining = CardOrder.delete(List.of(a,b,c), a);
        assertEquals(List.of(b,c), remaining);
        assertThrows(UnsupportedOperationException.class, () -> remaining.add(d));
        assertThrows(UnsupportedOperationException.class, () -> CardOrder.move(List.of(a),List.of(),a,0,false).destination().add(b));
    }
    @Test void corruptSnapshotsAndMissingCardsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> CardOrder.move(List.of(a,a),List.of(),a,0,false));
        assertThrows(IllegalArgumentException.class, () -> CardOrder.move(List.of(a),List.of(a),a,0,false));
        assertThrows(IllegalArgumentException.class, () -> CardOrder.move(List.of(a),List.of(b),a,0,true));
        assertThrows(Inputs.InvalidInput.class, () -> CardOrder.move(List.of(a),List.of(),b,0,false));
        assertThrows(Inputs.InvalidInput.class, () -> CardOrder.delete(List.of(a),b));
        assertThrows(IllegalArgumentException.class, () -> CardOrder.delete(null,a));
    }
    @Test void exhaustiveSmallSameColumnMovesKeepEveryCardExactlyOnce() {
        var ids = List.of(a,b,c,d);
        for (UUID id : ids) for (int position=0; position<ids.size(); position++) {
            var plan = CardOrder.move(ids,ids,id,position,true);
            assertEquals(id,plan.source().get(position));
            assertEquals(new java.util.HashSet<>(ids),new java.util.HashSet<>(plan.source()));
            assertEquals(ids.size(),plan.source().size());
            assertEquals(plan.source(),plan.destination());
        }
    }
}
